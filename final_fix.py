
import sys

def final_fix(filename):
    with open(filename, 'rb') as f:
        lines = f.readlines()
    
    # Block to insert
    insertion = [
        b'                  <button \n',
        b'                    disabled={isSubmittingAdminLoan || !selectedLoanUserId}\n',
        b'                    onClick={addAdminLoan}\n',
        b'                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"\n',
        b'                  >\n',
        b'                    {isSubmittingAdminLoan ? (\n',
        b'                      <>\n',
        b'                        <Clock className="w-5 h-5 animate-spin" /> Recording...\n',
        b'                      </>\n',
        b'                    ) : (\n',
        b'                      \'Record Loan\'\n',
        b'                    )}\n',
        b'                  </button>\n',
        b'                </div>\n',
        b'              </div>\n',
        b'            </motion.div>\n',
        b'          </div>\n',
        b'        )}\n',
        b'        {editingContribution && (\n',
        b'          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">\n',
        b'            <motion.div \n',
        b'              key="modal-edit-contrib-backdrop"\n',
        b'              initial={{ opacity: 0 }}\n'
    ]
    
    # We'll replace from the first "disabled={isSubmittingAdminLoan" we find after 9280
    # until the "animate={{ opacity: 1 }}"
    start_replace = 9286 # This was our button start
    end_replace = 9304 # This was where animate started
    
    new_lines = lines[:start_replace-1] + insertion + lines[end_replace:]
    
    with open(filename, 'wb') as f:
        f.writelines(new_lines)
    print("Fixed App.tsx")

if __name__ == "__main__":
    final_fix('src/App.tsx')
