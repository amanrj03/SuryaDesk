import { useEffect, useState } from 'react'

export function useResend() {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (!remaining) return
    const timer = setTimeout(() => setRemaining(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])
  return [remaining, () => setRemaining(60)]
}
