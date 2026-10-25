// "Only the newest request may fill the screen". Each request takes a ticket; when its answer arrives it is
// used only if no newer request has been started since. Without this, a slow answer for the previous choice
// (another warehouse, another filter) can arrive last and replace the right data with the wrong data.
export function newestOnly() {
  let current = 0;
  return {
    start: () => ++current,
    isNewest: (ticket) => ticket === current,
  };
}
