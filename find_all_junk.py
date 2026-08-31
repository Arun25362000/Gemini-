
import sys

def find_all_junk(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    
    i = 0
    line_num = 1
    while i < len(data):
        if data[i] == ord('\n'):
            line_num += 1
            i += 1
            continue
            
        # If it's a non-ASCII byte
        if data[i] > 127:
            # Check for common valid UTF-8 sequences (Rupee, Bullets, etc.)
            # Rupee: e2 82 b9
            if data[i:i+3] == b'\xe2\x82\xb9':
                i += 3
                continue
            # Bullets/Quotes/Dashes: e2 80 xx
            if data[i:i+2] == b'\xe2\x80':
                i += 3
                continue
            
            # If we are here, it's "unusual" non-ASCII
            print(f"Unusual byte {data[i]:02x} at line {line_num}, offset {i}")
            # Show 20 bytes of context
            start = max(0, i - 10)
            end = min(len(data), i + 40)
            print(f"Context: {data[start:end].hex()}")
            print(f"Repr: {repr(data[start:end])}")
            
            # Skip ahead to next likely line to avoid flooding
            next_line = data.find(b'\n', i)
            if next_line == -1: break
            i = next_line
        else:
            i += 1

if __name__ == "__main__":
    find_all_junk('src/App.tsx')
