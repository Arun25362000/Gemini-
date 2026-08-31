
import sys

def scan_non_ascii(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    
    line_num = 1
    for i, b in enumerate(data):
        if b == ord('\n'):
            line_num += 1
            continue
        
        # Flag anything non-ASCII
        if b > 127:
            # Skip Rupee symbol (e2 82 b9)
            if b == 0xe2 and i+2 < len(data) and data[i+1] == 0x82 and data[i+2] == 0xb9:
                continue # Skip the e2
            if i > 0 and data[i-1] == 0xe2 and b == 0x82 and i+1 < len(data) and data[i+1] == 0xb9:
                continue # Skip the 82
            if i > 1 and data[i-2] == 0xe2 and data[i-1] == 0x82 and b == 0xb9:
                continue # Skip the b9
                
            print(f"Non-ASCII at line {line_num}, offset {i}: {b:02x}")
            # If we find 10 in a row, it's probably junk
            count = 0
            for j in range(i, min(i+20, len(data))):
                 if data[j] > 127: count += 1
            if count > 10:
                print(f"Detected cluster of non-ASCII at line {line_num}")
                break

if __name__ == "__main__":
    scan_non_ascii('src/App.tsx')
