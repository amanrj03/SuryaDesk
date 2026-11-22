let loading

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    const timeout = setTimeout(failed, 12_000)
    function failed() {
      clearTimeout(timeout)
      script.remove()
      loading = undefined
      reject(new Error('Razorpay Checkout could not load. Please try again.'))
    }
    script.onload = () => {
      if (!window.Razorpay) return failed()
      clearTimeout(timeout)
      resolve(window.Razorpay)
    }
    script.onerror = failed
    document.head.append(script)
  })
  return loading
}

export async function openRazorpay({ key, amount, currency, orderId }) {
  const Razorpay = await loadCheckout()
  return new Promise(resolve => {
    const checkout = new Razorpay({
      key, amount, currency, order_id: orderId,
      name: 'SuryaDesk', description: 'Test payment',
      handler: ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) =>
        resolve({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
      modal: { ondismiss: () => resolve(null) },
    })
    checkout.open()
  })
}
