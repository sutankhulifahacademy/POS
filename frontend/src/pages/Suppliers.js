import CrudList from "../components/CrudList";
export default function Suppliers() {
  return <CrudList
    title="Supplier"
    subtitle="Kelola pemasok dan kontak pengadaan"
    endpoint="suppliers"
    testPrefix="supplier"
    fields={[
      { key: "name", label: "Nama Supplier", required: true },
      { key: "contact_person", label: "Kontak Person" },
      { key: "phone", label: "No. Telepon" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Alamat", type: "textarea", showInList: false },
    ]}
  />;
}
