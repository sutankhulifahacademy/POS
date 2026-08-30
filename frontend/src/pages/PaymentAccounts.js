import CrudList from "../components/CrudList";
import { useOutlet } from "../context/OutletContext";
export default function PaymentAccounts() {
  const { outletIdForApi } = useOutlet();
  return <CrudList
    title="Rekening Bank"
    subtitle="Kelola rekening tujuan untuk pembayaran transfer"
    endpoint="payment-accounts"
    testPrefix="payment-account"
    outletId={outletIdForApi}
    fields={[
      { key: "bank_name", label: "Nama Bank", required: true },
      { key: "account_name", label: "Nama Pemilik Rekening", required: true },
      { key: "account_no", label: "No. Rekening", required: true },
      { key: "is_active", label: "Aktif", type: "checkbox", default: true },
    ]}
  />;
}
