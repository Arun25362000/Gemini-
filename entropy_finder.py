
import sys
import math

def calculate_entropy(data):
    if not data:
        return 0
    entropy = 0
    for x in range(256):
        p_x = float(data.count(x))/len(data)
        if p_x > 0:
            entropy += - p_x * math.log(p_x, 2)
    return entropy

def find_high_entropy_lines(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    
    lines = data.split(b'\n')
    for i, line in enumerate(lines):
        if len(line) > 50:
            e = calculate_entropy(line)
            # Normal text entropy is usually 3-5. Random/compressed is 6-8.
            if e > 6.0:
                print(f"Line {i+1} has high entropy ({e:.2f}): {repr(line[:100])}...")

if __name__ == "__main__":
    find_high_entropy_lines('src/App.tsx')
