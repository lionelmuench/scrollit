#!/usr/bin/env python3
"""
Generate puzzles for Scrollit.
BFS shortest-path between random 4-letter word pairs.
Outputs puzzles.json with 500 puzzles, including the full optimal path.
"""

import json
import random
from collections import defaultdict, deque

def load_words(path):
    with open(path) as f:
        return [w.strip().upper() for w in f if len(w.strip()) == 4]

def build_graph(words):
    """Build adjacency list: words that differ by exactly 1 letter."""
    word_set = set(words)
    buckets = defaultdict(list)
    for w in words:
        for i in range(4):
            pattern = w[:i] + '_' + w[i+1:]
            buckets[pattern].append(w)
    
    graph = defaultdict(set)
    for bucket in buckets.values():
        for i in range(len(bucket)):
            for j in range(i+1, len(bucket)):
                graph[bucket[i]].add(bucket[j])
                graph[bucket[j]].add(bucket[i])
    return graph

def bfs_shortest(graph, start, target):
    """Return shortest path length from start to target, or -1 if unreachable."""
    if start == target:
        return 0
    visited = {start}
    queue = deque([(start, 0)])
    while queue:
        word, dist = queue.popleft()
        for neighbor in graph.get(word, []):
            if neighbor == target:
                return dist + 1
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, dist + 1))
    return -1

def bfs_path_with_slot_rule(graph, start, target):
    """
    BFS that respects the 'no same slot twice in a row' rule.
    State: (current_word, last_changed_slot)
    Returns the full optimal path as a list of words, or None if unreachable.
    """
    if start == target:
        return [start]
    
    # State: (word, last_slot) where last_slot is 0-3 or -1 for initial
    initial_state = (start, -1)
    visited = {initial_state}
    # Store parent pointers for path reconstruction: state -> parent_state
    parent = {initial_state: None}
    queue = deque([initial_state])
    
    found_state = None
    
    while queue:
        state = queue.popleft()
        word, last_slot = state
        
        for neighbor in graph.get(word, []):
            # Find which slot changed
            changed_slot = -1
            for i in range(4):
                if word[i] != neighbor[i]:
                    changed_slot = i
                    break
            
            # Skip if same slot as last turn
            if changed_slot == last_slot:
                continue
            
            next_state = (neighbor, changed_slot)
            
            if next_state in visited:
                continue
            
            visited.add(next_state)
            parent[next_state] = state
            
            if neighbor == target:
                found_state = next_state
                break
            
            queue.append(next_state)
        
        if found_state:
            break
    
    if not found_state:
        return None
    
    # Reconstruct path
    path = []
    s = found_state
    while s is not None:
        path.append(s[0])  # the word
        s = parent[s]
    path.reverse()
    return path

def main():
    words = load_words('wordlist.txt')
    starting = load_words('startingWords.txt')
    
    print(f"Loaded {len(words)} 4-letter words, {len(starting)} starting words")
    
    graph = build_graph(words)
    print(f"Built adjacency graph")
    
    # Filter starting words to those in the word list
    word_set = set(words)
    starting = [w for w in starting if w in word_set]
    print(f"{len(starting)} starting words are in word list")
    
    puzzles = []
    attempts = 0
    max_attempts = 5000
    
    while len(puzzles) < 500 and attempts < max_attempts:
        attempts += 1
        start = random.choice(starting)
        target = random.choice(starting)
        
        if start == target:
            continue
        
        # Check basic reachability first (fast)
        basic_dist = bfs_shortest(graph, start, target)
        if basic_dist < 0 or basic_dist < 3 or basic_dist > 12:
            continue  # Want puzzles that are 3-12 steps for good gameplay
        
        # Now find the full path with the slot rule
        path = bfs_path_with_slot_rule(graph, start, target)
        if path is None:
            continue
        
        optimal = len(path) - 1  # number of steps = edges in path
        if optimal < 3 or optimal > 15:
            continue
        
        puzzle = {
            "start": start,
            "target": target,
            "optimal": optimal,
            "optimalPath": path
        }
        
        # Avoid duplicates
        key = f"{start}-{target}"
        if any(f"{p['start']}-{p['target']}" == key for p in puzzles):
            continue
        
        puzzles.append(puzzle)
        
        if len(puzzles) % 50 == 0:
            print(f"  Generated {len(puzzles)} puzzles...")
    
    print(f"\nGenerated {len(puzzles)} puzzles in {attempts} attempts")
    
    # Shuffle so difficulty is mixed
    random.shuffle(puzzles)
    
    with open('puzzles.json', 'w') as f:
        json.dump(puzzles, f, indent=2)
    
    print(f"Saved to puzzles.json")
    
    # Print some stats
    optima = [p['optimal'] for p in puzzles]
    print(f"Optimal path lengths: min={min(optima)}, max={max(optima)}, avg={sum(optima)/len(optima):.1f}")

if __name__ == '__main__':
    main()
