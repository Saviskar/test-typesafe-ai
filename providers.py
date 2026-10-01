"""Provider-agnostic interface for the AI judgment calls used by tasks.py.

tasks.py depends on the Provider protocol below rather than on any specific
vendor SDK, so a task's logic never changes when a new backend is added here.
TypeSafe AI has a native structured-choice API; Anthropic, Gemini, and local
open-source models (via Ollama) do not, so those three share one prompt
template and JSON-parsing path (_PromptProvider) so they're being compared
on equal footing when evaluating model performance.
"""

from __future__ import annotations

import json
import re
import urllib.request
from dataclasses import dataclass
from types import TracebackType
from typing import Protocol, Self

from typesafe_sdk import Choice, TypeSafeClient

# Sentinel criterion offered alongside the real choices so the model can say
# "none of the above" instead of being forced to pick a wrong answer.
NONE_OF_THESE = "none_of_these"


@dataclass
class Usage:
    """Token usage accumulated by a provider across all its `choose` calls
    (persists across __enter__/__exit__ cycles, so a caller running several
    tasks against one provider instance can read a running total)."""

    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class ChoiceQuestion:
    """One provider-agnostic multiple-choice question: pick the criteria key
    that best fits, or None. `criteria` maps each candidate key to whatever
    context (sample values, evidence, or just None) describes it."""

    instructions: str
    criteria: dict[str, object | None]


class Provider(Protocol):
    """A backend that can answer a batch of ChoiceQuestions against shared
    state. Used as a context manager so a single session can be reused across
    multiple `choose` calls (e.g. one per item in a loop)."""

    def __enter__(self) -> Provider: ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...

    def choose(
        self, state: dict[str, object], questions: dict[str, ChoiceQuestion]
    ) -> dict[str, str | None]:
        """Resolve each question to its best-matching criteria key, or None."""
        ...

    usage: Usage


class TypeSafeProvider:
    """Provider backed by TypeSafe AI's Jev model (typesafe_sdk)."""

    def __init__(self) -> None:
        self._client: TypeSafeClient | None = None
        self.usage = Usage()

    def __enter__(self) -> TypeSafeProvider:
        self._client = TypeSafeClient().__enter__()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        assert self._client is not None, "TypeSafeProvider.__exit__ called without __enter__"
        self._client.__exit__(exc_type, exc, tb)
        self._client = None

    def choose(
        self, state: dict[str, object], questions: dict[str, ChoiceQuestion]
    ) -> dict[str, str | None]:
        assert self._client is not None, "TypeSafeProvider must be used as a context manager"
        response = self._client.system_one(
            state=state,
            questions={
                name: Choice(
                    instructions=q.instructions,
                    criteria={NONE_OF_THESE: None, **q.criteria},
                )
                for name, q in questions.items()
            },
        )
        if response.usage:
            self.usage.input_tokens += response.usage.input_tokens or 0
            self.usage.output_tokens += response.usage.output_tokens or 0
        return {
            name: None if response.choices[name].choice == NONE_OF_THESE else response.choices[name].choice
            for name in questions
        }


def _build_prompt(state: dict[str, object], questions: dict[str, ChoiceQuestion]) -> str:
    """Render one plain-text prompt covering every question, so a raw chat
    model can be asked all of them in a single request like system_one does."""
    lines = [
        "You are answering one or more multiple-choice questions about the data below.",
        "",
        "Data:",
        json.dumps(state, indent=2, default=str),
        "",
    ]
    for name, q in questions.items():
        lines.append(f'Question "{name}": {q.instructions}')
        lines.append("Options (respond with the exact key):")
        for key, value in q.criteria.items():
            lines.append(f"- {json.dumps(key)}: {json.dumps(value, default=str)}")
        lines.append(f"- {json.dumps(NONE_OF_THESE)}: use this if none of the options fit")
        lines.append("")
    names = ", ".join(json.dumps(n) for n in questions)
    lines.append(
        "Respond with ONLY a single JSON object mapping each question name to your "
        f"chosen key, and no other text. Keys to include: {names}."
    )
    return "\n".join(lines)


def _parse_json_object(text: str) -> dict[str, object]:
    """Best-effort JSON-object extraction from a model's raw text response,
    tolerating markdown code fences or stray prose around the JSON."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


class _PromptProvider:
    """Base for providers with no native structured-choice API: builds one
    prompt per `choose` call via _build_prompt, asks the model to answer in
    JSON, and validates the response against each question's real criteria
    keys (falling back to None for anything missing, unparsable, or
    hallucinated). Subclasses only implement `_complete`.
    """

    def __init__(self) -> None:
        self.usage = Usage()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc: BaseException | None,
        _tb: TracebackType | None,
    ) -> None:
        return None

    def _complete(self, _prompt: str) -> str:
        raise NotImplementedError

    def choose(
        self, state: dict[str, object], questions: dict[str, ChoiceQuestion]
    ) -> dict[str, str | None]:
        answers = _parse_json_object(self._complete(_build_prompt(state, questions)))
        results: dict[str, str | None] = {}
        for name, q in questions.items():
            answer = answers.get(name)
            results[name] = answer if isinstance(answer, str) and answer in q.criteria else None
        return results


class AnthropicProvider(_PromptProvider):
    """Provider backed by an Anthropic Claude model."""

    def __init__(self, model: str = "claude-haiku-4-5-20251001") -> None:
        import anthropic

        super().__init__()
        self.model = model
        self._client = anthropic.Anthropic()

    def _complete(self, prompt: str) -> str:
        response = self._client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        self.usage.input_tokens += response.usage.input_tokens
        self.usage.output_tokens += response.usage.output_tokens
        return "".join(block.text for block in response.content if block.type == "text")


class GeminiProvider(_PromptProvider):
    """Provider backed by a Google Gemini model."""

    def __init__(self, model: str = "gemini-flash-latest") -> None:
        from google import genai

        super().__init__()
        self.model = model
        self._client = genai.Client()

    def _complete(self, prompt: str) -> str:
        response = self._client.models.generate_content(model=self.model, contents=prompt)
        if response.usage_metadata:
            self.usage.input_tokens += response.usage_metadata.prompt_token_count or 0
            self.usage.output_tokens += response.usage_metadata.candidates_token_count or 0
        return response.text or ""


class OllamaProvider(_PromptProvider):
    """Provider backed by a locally running open-source model via Ollama.
    Requires `ollama serve` running locally with `model` already pulled
    (`ollama pull <model>`)."""

    def __init__(self, model: str, base_url: str = "http://localhost:11434") -> None:
        super().__init__()
        self.model = model
        self.base_url = base_url.rstrip("/")

    def _complete(self, prompt: str) -> str:
        body = json.dumps(
            {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
            }
        ).encode()
        request = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read())
        self.usage.input_tokens += payload.get("prompt_eval_count", 0)
        self.usage.output_tokens += payload.get("eval_count", 0)
        return payload["message"]["content"]


# Short names for CLI/config-driven provider selection.
_REGISTRY = {
    "typesafe": TypeSafeProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}


def get_provider(name: str, model: str | None = None) -> Provider:
    """Construct a Provider by short name (see _REGISTRY). `model` overrides
    that provider's default model; OllamaProvider has no default and requires
    one (the name of a model you've already run `ollama pull` for)."""
    if name not in _REGISTRY:
        raise ValueError(f"Unknown provider {name!r}, expected one of {sorted(_REGISTRY)}")
    if name == "typesafe":
        return TypeSafeProvider()
    if name == "ollama":
        if not model:
            raise ValueError("ollama provider requires --model (a name you've already run `ollama pull` for)")
        return OllamaProvider(model)
    return _REGISTRY[name](model) if model else _REGISTRY[name]()
