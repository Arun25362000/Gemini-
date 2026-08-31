
import sys

def find_unusual_chars(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    
    lines = data.split(b'\n')
    for i, line in enumerate(lines):
        # Allow ASCII (32-126), tab (9), newline (10), carriage return (13)
        # And common UTF-8 sequences like Rupee (e2 82 b9)
        # For simplicity, let's just flag lines with many non-printable chars
        non_printable = [b for b in line if b < 9 or (b > 13 and b < 32) or (b > 126 and b < 160)]
        if non_printable:
            # Check if it's just the Rupee symbol (e2 82 b9)
            try:
                line.decode('utf-8')
                # It's valid UTF-8, but maybe it has junk
                if len(line) > 500:
                    print(f"Line {i+1} is very long: {len(line)}")
                # If it has more than 10 non-ASCII chars and isn't a long line of comments/strings
                non_ascii = [b for b in line if b > 127]
                if len(non_ascii) > 20:
                     print(f"Line {i+1} has many non-ASCII chars ({len(non_ascii)}): {repr(line[:100])}...")
            except UnicodeDecodeError:
                print(f"Line {i+1} has invalid UTF-8: {repr(line[:100])}...")

if __name__ == "__main__":
    find_unusual_chars('src/App.tsx')
