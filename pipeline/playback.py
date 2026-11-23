"""Where the owner of a journey is at a time: the reference for the app's playback.

docs/DATA_FORMAT.md, rule 4, says what playback does; ``head_at`` is that rule as code. The app has
the same function in TypeScript (web/src/lib/playback.ts). ``make data`` writes journeys with the
heads this module computes into a fixture, and the app's tests hold its function to every one of them.
"""
from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence
from typing import Any

Json = dict[str, Any]  # a JSON object on its way to a file

ONE_ROW = "a journey with one row"
# No path in the data has a single row (docs/DATA_NOTES.md, A9), so the journey for that case is made up.
MADE_UP_ONE_ROW: Json = {"id": "made-up-one-row", "t": [7], "u": [1200], "v": [3400], "e": [0]}


def head_at(t: Sequence[int], u: Sequence[float], v: Sequence[float], path_length: int, at: float, step: int) -> tuple[float, float] | None:
    """The place of a journey's head ``at`` seconds into its match, or None before its first row.

    ``t``, ``u`` and ``v`` are the journey's rows in time order; the first ``path_length`` of them
    are its path. Between two rows at most ``step`` seconds apart the head moves in a straight line.
    Across a longer gap it stays at the earlier row and covers the distance in the last ``step``
    seconds (assumption A6). Of rows in the same second the last one counts. After the last row of
    the path the head stays where it is.
    """
    if path_length == 0 or at < t[0]:
        return None
    row = 0
    while row + 1 < path_length and t[row + 1] <= at:
        row += 1
    if row == path_length - 1:
        return float(u[row]), float(v[row])
    leaves = max(t[row], t[row + 1] - step)  # across a longer gap it stands still until then
    if at <= leaves:
        return float(u[row]), float(v[row])
    share = (at - leaves) / (t[row + 1] - leaves)
    return u[row] + (u[row + 1] - u[row]) * share, v[row] + (v[row + 1] - v[row]) * share


def path_length(events: Sequence[int], death_codes: Collection[int]) -> int:
    """The number of rows in a journey's path: all of them up to and including its death row."""
    for row, code in enumerate(events):
        if code in death_codes:
            return row + 1
    return len(events)


def case_names(step: int) -> list[str]:
    """The cases of the rule that the fixture looks for in the data, in the order it lists them."""
    return [f"a {step} s step", "a long gap", "a death long after the last sample", "two rows in the same second", "not on the map at 0:00"]


def cases_shown(journey: Json, length: int, dies: bool, step: int) -> set[str]:
    """The cases that the path of a journey shows. ``dies`` says that the last row of the path is a death row.

    A case counts only where the place changes between the two rows, so that a wrong head would be seen.
    """
    t, u, v = journey["t"], journey["u"], journey["v"]
    steps = [(t[row + 1] - t[row], (u[row], v[row]) != (u[row + 1], v[row + 1])) for row in range(length - 1)]
    before_the_death = steps[:-1] if dies else steps
    step_of_clock, long_gap, late_death, same_second, late_start = case_names(step)
    shown = set()
    if any(seconds == step and moved for seconds, moved in steps):
        shown.add(step_of_clock)
    if any(seconds > step and moved for seconds, moved in before_the_death):
        shown.add(long_gap)
    if dies and steps and steps[-1][0] > step and steps[-1][1]:
        shown.add(late_death)
    if any(seconds == 0 and moved for seconds, moved in steps):
        shown.add(same_second)
    if t[0] > 0:
        shown.add(late_start)
    return shown


def sample_times(t: Sequence[int], length: int, step: int) -> list[float]:
    """The times at which the fixture records a head: every row of the path, points between, before the first and after the last."""
    times = {t[0] - 0.5, t[length - 1] + 0.5, t[length - 1] + 60.0} | {float(t[row]) for row in range(length)}
    for row in range(length - 1):
        start, end = t[row], t[row + 1]
        if end > start:
            times |= {start + (end - start) / 4, (start + end) / 2}
        if end - start > step:
            times |= {float(end - step), end - step / 2}  # where it leaves, and half-way through its last step
    return sorted(times)


def _case(name: str, journey: Json, length: int, step: int, made_up: bool) -> Json:
    t, u, v = journey["t"], journey["u"], journey["v"]
    heads = []
    for at in sample_times(t, length, step):
        head = head_at(t, u, v, length, at, step)
        heads.append({"at": at, "head": None if head is None else list(head)})
    return {"case": name, "id": journey["id"], "made_up": made_up, "path_length": length, "t": t, "u": u, "v": v, "heads": heads}


def playback_fixture(journeys: Iterable[Json], death_codes: Collection[int], step: int) -> Json:
    """Journeys with the head that ``head_at`` gives at many times, for the tests of the app's playback.

    For every case of the rule the fixture holds the journey with the shortest path that shows it,
    of two equally short the one whose id sorts first. A case that no journey shows is left out: the
    tests of the committed data say which cases the real data has. The journey with one row is made up.
    """
    shortest: dict[str, tuple[int, str, Json]] = {}
    for journey in journeys:
        length = path_length(journey["e"], death_codes)
        dies = journey["e"][length - 1] in death_codes
        for name in cases_shown(journey, length, dies, step):
            if name not in shortest or (length, journey["id"]) < shortest[name][:2]:
                shortest[name] = (length, journey["id"], journey)
    cases = [_case(name, shortest[name][2], shortest[name][0], step, made_up=False) for name in case_names(step) if name in shortest]
    cases.append(_case(ONE_ROW, MADE_UP_ONE_ROW, 1, step, made_up=True))
    return {"generated_by": "pipeline/build_data.py from pipeline/playback.py; do not edit", "sample_step_seconds": step, "cases": cases}
