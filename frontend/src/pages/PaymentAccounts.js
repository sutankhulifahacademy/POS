import CrudList from "../components/CrudList";
export default function PaymentAccounts() {
  return <CrudList
    title="Rekening Bank"
    subtitle="Kelola rekening tujuan untuk pembayaran transfer"
    endpoint="payment-accounts"
    testPrefix="payment-account"
    fields={[
      { key: "bank_name", label: "Nama Bank", required: true },
      { key: "account_name", label: "Nama Pemilik Rekening", required: true },
      { key: "account_no", label: "No. Rekening", required: true },
      { key: "is_active", label: "Aktif", type: "checkbox", default: true },
    ]}
  />;
}
