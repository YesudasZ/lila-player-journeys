"""The metrics of the report: named measurements, each stored with the exact definition used to compute it."""
from __future__ import annotations

from pipeline.profile.values import plain

Entries = dict[str, dict[str, object]]  # metric key -> {"value": ..., "definition": ...}, in the order measured
Section = tuple[Entries, dict[str, object]]  # what a section of the report returns: its metrics and its details


class Metrics:
    """Collects measurements in the order they are added.

    ``definitions`` maps the name of every metric to its definition. A name
    may hold fields, as in "files_{day}": it then stands for one metric per
    day folder, and ``add`` fills the fields into the name and the definition.
    """

    def __init__(self, definitions: dict[str, str]) -> None:
        """Start empty, with the definitions of the metrics that will be added."""
        self._definitions = definitions
        self._entries: Entries = {}

    def add(self, name: str, value: object, **fields: object) -> None:
        """Store a value under ``name``. A key that is already taken is an error, never a silent overwrite."""
        key = name.format(**fields)
        if key in self._entries:
            raise ValueError(f"metric {key} is measured twice")
        self._entries[key] = {"value": plain(value), "definition": self._definitions[name].format(**fields)}

    def as_dict(self) -> Entries:
        """Every metric added so far: key -> value and definition."""
        return self._entries


def joined(*groups: Entries) -> Entries:
    """Several groups of metrics as one, in the order given. A key in two groups is an error, never a silent overwrite."""
    whole: Entries = {}
    for group in groups:
        for key, entry in group.items():
            if key in whole:
                raise ValueError(f"metric {key} is measured twice")
            whole[key] = entry
    return whole
