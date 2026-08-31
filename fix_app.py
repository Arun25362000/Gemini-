
import sys

def replace_lines(filename, start_line, end_line, replacement_text):
    with open(filename, 'rb') as f:
        lines = f.readlines()
    
    # Replacement text should be bytes
    replacement_lines = [line.encode('utf-8') + b'\n' for line in replacement_text.split('\n')]
    
    # start_line is 1-indexed
    new_lines = lines[:start_line-1] + replacement_lines + lines[end_line:]
    
    with open(filename, 'wb') as f:
        f.writelines(new_lines)
    print(f"Replaced lines {start_line} to {end_line}")

# This is the code that SHOULD be around line 9284-9350
# Based on my previous sed output
clean_code = """                  <button 
                    onClick={() => setIsAddingLoan(false)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isSubmittingAdminLoan || !selectedLoanUserId}
                    onClick={addAdminLoan}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                  >
                    {isSubmittingAdminLoan ? (
                      <>
                        <Clock className="w-5 h-5 animate-spin" /> Recording...
                      </>
                    ) : (
                      'Record Loan'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}"""

if __name__ == "__main__":
    replace_lines('src/App.tsx', 9280, 9308, clean_code)
