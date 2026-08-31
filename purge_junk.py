
import sys

def purge_junk(filename):
    with open(filename, 'rb') as f:
        lines = f.readlines()
    
    cleaned_lines = []
    purged_count = 0
    for i, line in enumerate(lines):
        # Look for the junk pattern from the user's report
        # It starts with 'x' (0x78) and is very long/dense
        non_printable = sum(1 for b in line if b < 32 and b not in [9, 10, 13])
        if non_printable > 20 or (len(line) > 100 and non_printable / len(line) > 0.1):
            print(f"Purging line {i+1} due to high non-printable count ({non_printable})")
            purged_count += 1
            # If it's the junk line at 9286, we should replace it with what was SUPPOSED to be there
            if i + 1 == 9286:
                 cleaned_lines.append(b'                  <button \n')
            continue
        cleaned_lines.append(line)
    
    with open(filename, 'wb') as f:
        f.writelines(cleaned_lines)
    print(f"Purged {purged_count} lines.")

if __name__ == "__main__":
    purge_junk('src/App.tsx')
