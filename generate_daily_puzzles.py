#!/usr/bin/env python3
"""
Generate a daily-friendly puzzle catalog for Scrollit.

The input word pool is a curated list of recognizable 4-letter words stored in
common_words.txt. The output keeps the existing puzzle schema so the client can
use start / target / optimal / optimalPath without additional translation.
"""

import json
import random
from collections import defaultdict, deque
from pathlib import Path

CURATED_WORDS_PATH = Path("common_words.txt")
OUTPUT_PATH = Path("puzzles.json")
TOTAL_PUZZLES = 730
MIN_STEPS = 3
MAX_STEPS = 6
SEED = 20260401

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


def bfs_path_with_slot_rule(graph: dict[str, set[str]], start: str, target: str) -> list[str] | None:
    initial_state = (start, -1)
    queue = deque([initial_state])
    visited = {initial_state}
    parent = {initial_state: None}

    while queue:
        word, last_slot = queue.popleft()
        for neighbor in sorted(graph[word]):
            changed_slot = next(index for index in range(4) if word[index] != neighbor[index])
            if changed_slot == last_slot:
                continue

            next_state = (neighbor, changed_slot)
            if next_state in visited:
                continue

            visited.add(next_state)
            parent[next_state] = (word, last_slot)

            if neighbor == target:
                path: list[str] = []
                cursor = next_state
                while cursor is not None:
                    path.append(cursor[0])
                    cursor = parent[cursor]
                return list(reversed(path))

            queue.append(next_state)

    return None


def generate_puzzles(words: list[str], graph: dict[str, set[str]]) -> list[dict]:
    rng = random.Random(SEED)
    display_words = [word for word in words if word not in DISPLAY_BLOCKLIST]
    attempted_pairs: set[tuple[str, str]] = set()
    puzzles: list[dict] = []

    max_attempts = 200000
    attempts = 0

    while len(puzzles) < TOTAL_PUZZLES and attempts < max_attempts:
        attempts += 1
        start, target = rng.sample(display_words, 2)
        pair_key = (start, target)
        if pair_key in attempted_pairs:
            continue
        attempted_pairs.add(pair_key)

        path = bfs_path_with_slot_rule(graph, start, target)
        if not path:
            continue

        optimal = len(path) - 1
        if optimal < MIN_STEPS or optimal > MAX_STEPS:
            continue

        puzzles.append({
            "start": start,
            "target": target,
            "optimal": optimal,
            "optimalPath": path
        })

    if len(puzzles) < TOTAL_PUZZLES:
        raise RuntimeError(
            f"Only generated {len(puzzles)} puzzles after {attempts} attempts; "
            "expand the curated word pool or relax the filters."
        )

    return puzzles


def main() -> None:
    words = load_words(CURATED_WORDS_PATH)
    graph = build_graph(words)
    component_words = largest_component(words, graph)
    component_graph = build_graph(component_words)
    puzzles = generate_puzzles(component_words, component_graph)

    OUTPUT_PATH.write_text(json.dumps(puzzles, indent=2) + "\n")

    lengths = [puzzle["optimal"] for puzzle in puzzles]
    print(f"Curated words loaded: {len(words)}")
    print(f"Largest component used: {len(component_words)}")
    print(f"Puzzles generated: {len(puzzles)}")
    print(
        "Optimal lengths:",
        f"min={min(lengths)} max={max(lengths)} avg={sum(lengths) / len(lengths):.2f}"
    )


if __name__ == "__main__":
    main()
