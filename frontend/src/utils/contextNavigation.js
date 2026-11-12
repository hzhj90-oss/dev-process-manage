// Strictly accept a single positive database ID from a router query.
// Vue Router may expose repeated query keys as arrays: never coerce those.
export function contextId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value)
  if (!/^[1-9][0-9]{0,14}$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function contextLink(routeName, key, value) {
  const id = contextId(value)
  if (!id || !['versions', 'requirements', 'test-cycles', 'test-cases'].includes(routeName)
      || !['projectId', 'versionId', 'requirementId'].includes(key)) return null
  if (routeName === 'versions' && key !== 'projectId') return null
  if (routeName === 'test-cases' && key !== 'requirementId') return null
  if (routeName !== 'versions' && routeName !== 'test-cases' && key !== 'versionId') return null
  return { name: routeName, query: { [key]: String(id) } }
}
