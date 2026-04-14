#!/usr/bin/env python3
"""
Generate a daily-friendly puzzle catalog for Scrollit.

Start / target words come from a curated list of recognizable 4-letter words in
common_words.txt, but the optimal solver must use the same full playable
dictionary as the live game (`wordlist.txt`). Otherwise the stored `optimal`
count can be beaten by legal in-game solutions that pass validation.
"""

import json
import random
from collections import defaultdict, deque
from functools import lru_cache
from itertools import product
from pathlib import Path

PLAYABLE_WORDS_PATH = Path("wordlist.txt")
CURATED_WORDS_PATH = Path("common_words.txt")
OUTPUT_PATH = Path("puzzles.json")
TOTAL_PUZZLES = 1825
MIN_STEPS = 3
MAX_STEPS = 6
SEED = 20260401
STEP_PRIORITY = (4, 5, 3, 6)
STEP_WEIGHTS = {
    4: 0.52,
    5: 0.28,
    3: 0.19,
    6: 0.01,
}

# Avoid awkward daily prompts while still allowing common intermediate words.
DISPLAY_BLOCKLIST = {
    "AIDS", "ALAN", "ANNA", "BABE", "BANG", "BUTT", "COIN", "DEBT", "DRUG",
    "JAVA", "JANE", "JAZZ", "JEAN", "JOBS", "JOHN", "JOKE", "JURY", "KILL",
    "NULL", "NUDE", "SUCK", "TECH", "TEXT", "UGLY", "VOID"
}


def load_words(path: Path) -> list[str]:
    return sorted({
        word.strip().upper()
        for word in path.read_text().splitlines()
        if len(word.strip()) == 4 and word.strip().isalpha()
    })


def build_graph(words: list[str]) -> dict[str, set[str]]:
    buckets: dict[str, list[str]] = defaultdict(list)
    for word in words:
        for index in range(4):
            buckets[word[:index] + "_" + word[index + 1:]].append(word)

    graph: dict[str, set[str]] = defaultdict(set)
    for bucket_words in buckets.values():
        for left_index in range(len(bucket_words)):
            for right_index in range(left_index + 1, len(bucket_words)):
                left = bucket_words[left_index]
                right = bucket_words[right_index]
                graph[left].add(right)
                graph[right].add(left)
    return graph


def largest_component(words: list[str], graph: dict[str, set[str]]) -> list[str]:
    seen: set[str] = set()
    best: list[str] = []

    for word in words:
        if word in seen:
            continue

        queue = deque([word])
        seen.add(word)
        component: list[str] = []

        while queue:
            current = queue.popleft()
            component.append(current)
            for neighbor in graph[current]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    queue.append(neighbor)

        if len(component) > len(best):
            best = component

    return sorted(best)


def shortest_path_with_slot_rule(
    graph: dict[str, set[str]],
    start: str,
    target: str,
    preferred_words: set[str],
) -> list[str] | None:
    if start == target:
        return [start]

    initial_state = (start, -1)
    queue = deque([initial_state])
    distance = {initial_state: 0}
    parent_map: dict[tuple[str, int], list[tuple[str, int]]] = {initial_state: []}
    target_states: set[tuple[str, int]] = set()
    best_steps: int | None = None

    while queue:
        state = queue.popleft()
        word, last_slot = state
        steps = distance[state]

        if best_steps is not None and steps >= best_steps:
            continue

        for neighbor in graph[word]:
            changed_slot = next(index for index in range(4) if word[index] != neighbor[index])
            if changed_slot == last_slot:
                continue

            next_state = (neighbor, changed_slot)
            next_steps = steps + 1
            known_steps = distance.get(next_state)

            if known_steps is None:
                distance[next_state] = next_steps
                parent_map[next_state] = [state]
            elif known_steps == next_steps:
                parent_map[next_state].append(state)
            else:
                continue

            if neighbor == target:
                best_steps = next_steps
                target_states.add(next_state)
                continue

            if known_steps is None:
                queue.append(next_state)

    if not target_states:
        return None

    @lru_cache(maxsize=None)
    def best_suffix(state: tuple[str, int]) -> tuple[int, int, tuple[str, ...]]:
        if state == initial_state:
            return (0, 0, (start,))

        word, _ = state
        is_intermediate = word not in {start, target}
        blocked_penalty = int(is_intermediate and word in DISPLAY_BLOCKLIST)
        uncommon_penalty = int(is_intermediate and word not in preferred_words)
        candidates = []

        for parent_state in parent_map[state]:
            blocked_count, uncommon_count, path_words = best_suffix(parent_state)
            candidates.append((
                blocked_count + blocked_penalty,
                uncommon_count + uncommon_penalty,
                path_words + (word,),
            ))

        return min(candidates)

    return list(min(best_suffix(state) for state in target_states)[2])


def build_step_targets(total_puzzles: int) -> dict[int, int]:
    targets = {step: int(total_puzzles * STEP_WEIGHTS[step]) for step in STEP_PRIORITY}
    remainder = total_puzzles - sum(targets.values())

    for step in STEP_PRIORITY:
        if remainder <= 0:
            break
        targets[step] += 1
        remainder -= 1

    return targets


def generate_puzzles(
    display_words: list[str],
    graph: dict[str, set[str]],
    preferred_words: set[str],
) -> list[dict]:
    rng = random.Random(SEED)
    target_by_step = build_step_targets(TOTAL_PUZZLES)
    puzzles_by_step = {step: [] for step in STEP_PRIORITY}
    overflow_by_step = {step: [] for step in STEP_PRIORITY}

    pair_order = [
        (display_words[start_index], display_words[target_index])
        for start_index, target_index in product(range(len(display_words)), repeat=2)
        if start_index != target_index
    ]
    rng.shuffle(pair_order)

    for start, target in pair_order:
        if sum(len(puzzles_by_step[step]) for step in STEP_PRIORITY) >= TOTAL_PUZZLES:
            break

        path = shortest_path_with_slot_rule(graph, start, target, preferred_words)
        if not path:
            continue

        optimal = len(path) - 1
        if optimal not in STEP_PRIORITY:
            continue
        if any(word in DISPLAY_BLOCKLIST for word in path[1:-1]):
            continue

        puzzle = {
            "start": start,
            "target": target,
            "optimal": optimal,
            "optimalPath": path
        }

        target_bucket = puzzles_by_step[optimal]
        if len(target_bucket) < target_by_step[optimal]:
            target_bucket.append(puzzle)
            if all(len(puzzles_by_step[step]) >= target_by_step[step] for step in STEP_PRIORITY):
                break
        else:
            overflow_by_step[optimal].append(puzzle)

    puzzles = []
    for step in STEP_PRIORITY:
        puzzles.extend(puzzles_by_step[step])

    if len(puzzles) < TOTAL_PUZZLES:
        for step in STEP_PRIORITY:
            deficit = TOTAL_PUZZLES - len(puzzles)
            if deficit <= 0:
                break
            puzzles.extend(overflow_by_step[step][:deficit])

    if len(puzzles) < TOTAL_PUZZLES:
        raise RuntimeError(
            f"Only generated {len(puzzles)} puzzles from the curated pair pool; "
            "expand the curated word pool or relax the filters."
        )

    rng.shuffle(puzzles)
    return puzzles


def main() -> None:
    playable_words = load_words(PLAYABLE_WORDS_PATH)
    playable_graph = build_graph(playable_words)
    component_words = largest_component(playable_words, playable_graph)
    component_graph = build_graph(component_words)
    component_word_set = set(component_words)

    curated_words = load_words(CURATED_WORDS_PATH)
    preferred_words = {
        word for word in curated_words
        if word in component_word_set
    }
    display_words = sorted(
        word for word in preferred_words
        if word not in DISPLAY_BLOCKLIST
    )

    puzzles = generate_puzzles(display_words, component_graph, preferred_words)

    OUTPUT_PATH.write_text(json.dumps(puzzles, indent=2) + "\n")

    lengths = [puzzle["optimal"] for puzzle in puzzles]
    print(f"Playable words loaded: {len(playable_words)}")
    print(f"Curated display words loaded: {len(curated_words)}")
    print(f"Largest component used: {len(component_words)}")
    print(f"Curated start/target words in component: {len(display_words)}")
    print(f"Puzzles generated: {len(puzzles)}")
    print(
        "Optimal lengths:",
        f"min={min(lengths)} max={max(lengths)} avg={sum(lengths) / len(lengths):.2f}"
    )


if __name__ == "__main__":
    main()
