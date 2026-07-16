# Generated recall artifacts

Each child directory is one immutable, reviewed compiler run. It contains:

- `accepted-cards.json`: the canonical D1 import artifact;
- `rejected-cards.json`: cards held out by either independent reviewer;
- `recall-generation-run.json`: models, source fingerprint, counts, logs pointer, and artifact hash.
- the exact official-page evidence, prompts, raw structured model outputs, normalized candidates,
  independent review decisions, and Codex usage summaries needed to audit the run.

Raw event streams remain under `tmp/recall-generation/<run-id>/`; they are diagnostic logs, not import
authority. Never import a temporary file. Generate a new run ID rather than modifying an accepted
artifact in place.
