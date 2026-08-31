
import sys

def find_junk_raw(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    
    # Search for sequences of 5+ bytes that are likely binary junk
    # (not printable ASCII, not Rupee symbol, not common white space)
    junk_starts = []
    i = 0
    while i < len(data):
        b = data[i]
        # Common valid bytes: 9, 10, 13, 32-126
        # Common UTF-8: e2 82 b9
        is_valid = (9 <= b <= 13) or (32 <= b <= 126)
        if not is_valid:
            # Check for Rupee
            if b == 0xe2 and i+2 < len(data) and data[i+1] == 0x82 and data[i+2] == 0xb9:
                i += 3
                continue
            # Check for other common UTF-8 (bullets etc)
            if b == 0xe2 and i+2 < len(data) and data[i+1] == 0x80:
                i += 3
                continue
                
            # Possible junk start
            start = i
            while i < len(data):
                b = data[i]
                is_valid = (9 <= b <= 13) or (32 <= b <= 126)
                if is_valid: break
                # Also break if we hit a Rupee sequence
                if b == 0xe2 and i+2 < len(data) and data[i+1] == 0x82 and data[i+2] == 0xb9:
                    break
                i += 1
            
            junk_len = i - start
            if junk_len > 10:
                print(f"Junk found at offset {start}, length {junk_len}: {data[start:start+50].hex()}...")
                # Calculate line number
                line_num = data[:start].count(b'\n') + 1
                print(f"Likely line number: {line_num}")
                junk_starts.append((start, i))
        i += 1
    return junk_starts

if __name__ == "__main__":
    find_junk_raw('src/App.tsx')
