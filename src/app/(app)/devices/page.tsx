import { redirect } from 'next/navigation'

// /devices has been superseded by /expenses
export default function DevicesPage() {
  redirect('/expenses')
}
