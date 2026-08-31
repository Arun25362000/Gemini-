
import sys
import re

def find_junk(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    
    # Try to find a long sequence of non-ASCII, non-printable characters
    # Or just look at the line 9286 specifically
    lines = data.split(b'\n')
    if len(lines) >= 9286:
        line_9286 = lines[9285] # 0-indexed
        print(f"Line 9286 length: {len(line_9286)}")
        print(f"Line 9286 content (repr): {repr(line_9286)}")
        
        # Check if it has a lot of non-printable chars
        non_printable = sum(1 for b in line_9286 if b < 32 or b > 126)
        print(f"Non-printable count in line 9286: {non_printable}")

if __name__ == "__main__":
    find_junk('src/App.tsx')
