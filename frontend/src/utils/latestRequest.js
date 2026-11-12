// A response can update a list only if it belongs to the latest issued request.
// This is intentionally independent of Axios so delayed responses and failures
// from older requests cannot overwrite data, errors, or loading state.
export function createLatestRequest() {
  let generation = 0
  return {
    begin() { return ++generation },
    isCurrent(token) { return token === generation },
    invalidate() { generation++ }
  }
}
