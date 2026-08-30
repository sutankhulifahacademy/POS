import CrudList from "../components/CrudList";
import { useOutlet } from "../context/OutletContext";
export default function Suppliers() {
  const { outletIdForApi } = useOutlet();
  return <CrudList
    title="Supplier"
    subtitle="Kelola pemasok dan kontak pengadaan"
    endpoint="suppliers"
    testPrefix="supplier"
    outletId={outletIdForApi}
    fields={[
      { key: "name", label: "Nama Supplier", required: true },
      { key: "contact_person", label: "Kontak Person" },
      { key: "phone", label: "No. Telepon" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Alamat", type: "textarea", showInList: false },
    ]}
  />;
}
