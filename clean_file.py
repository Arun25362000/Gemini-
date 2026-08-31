
import sys

def clean_file(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    
    # Strip non-UTF-8 or just replace invalid sequences
    # We want to keep valid UTF-8 but remove binary junk
    cleaned_data = data.decode('utf-8', errors='ignore').encode('utf-8')
    
    with open(filename, 'wb') as f:
        f.write(cleaned_data)
    print(f"Cleaned {filename}. Original size: {len(data)}, New size: {len(cleaned_data)}")

if __name__ == "__main__":
    clean_file('src/App.tsx')
