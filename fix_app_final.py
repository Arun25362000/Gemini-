
import sys

def fix_app_final(filename):
    with open(filename, 'rb') as f:
        lines = f.readlines()
    
    # We need to find the block around 9280-9310 and fix the missing tags
    # The sed output showed line 9284 was "Cancel"
    # Let's find the 'editingContribution && (' line
    start_idx = -1
    for i, line in enumerate(lines):
        if b'editingContribution && (' in line:
            start_idx = i
            break
    
    if start_idx != -1:
        print(f"Found editingContribution modal start at line {start_idx + 1}")
        # Check next lines for missing motion.div
        # If it looks like props starting immediately, fix it
        if b'animate={{ opacity: 1 }}' in lines[start_idx+2]:
             print("Detected missing motion.div opening tag. Fixing...")
             fix_lines = [
                 b'        {editingContribution && (\n',
                 b'          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">\n',
                 b'            <motion.div \n',
                 b'              key="modal-edit-contrib-backdrop"\n',
                 b'              initial={{ opacity: 0 }}\n'
             ]
             # Replace lines from start_idx to start_idx + 2
             new_lines = lines[:start_idx] + fix_lines + lines[start_idx+2:]
             
             with open(filename, 'wb') as f:
                 f.writelines(new_lines)
             print("Successfully fixed App.tsx structure.")
        else:
             print("Structure seems different than expected. Manual fix needed.")
    else:
        print("Could not find editingContribution modal start.")

if __name__ == "__main__":
    fix_app_final('src/App.tsx')
