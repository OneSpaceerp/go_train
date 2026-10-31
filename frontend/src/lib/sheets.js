// History bookkeeping for sheets. Each open sheet owns one history entry, so
// the back gesture / Android back closes it. history.back() is asynchronous,
// so a sheet opened right after another closes waits for that pop to land;
// otherwise its new entry would be the one popped.

let settled = Promise.resolve()

export function popSheetEntry() {
  settled = new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      window.removeEventListener('popstate', done)
      resolve()
    }
    const timer = setTimeout(done, 600)
    window.addEventListener('popstate', done)
    window.history.back()
  })
  return settled
}

export const sheetHistorySettled = () => settled
