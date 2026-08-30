import CrudList from "../components/CrudList";
export default function Customers() {
  return <CrudList
    title="Pelanggan"
    subtitle="Kelola data pelanggan dan poin loyalitas"
    endpoint="customers"
    testPrefix="customer"
    fields={[
      { key: "name", label: "Nama", required: true },
      { key: "phone", label: "No. Telepon" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Alamat", type: "textarea", showInList: false },
    ]}
  />;
}
