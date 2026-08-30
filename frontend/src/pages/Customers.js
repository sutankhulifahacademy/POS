import CrudList from "../components/CrudList";
import { useOutlet } from "../context/OutletContext";
export default function Customers() {
  const { outletIdForApi } = useOutlet();
  return <CrudList
    title="Pelanggan"
    subtitle="Kelola data pelanggan dan poin loyalitas"
    endpoint="customers"
    testPrefix="customer"
    outletId={outletIdForApi}
    fields={[
      { key: "name", label: "Nama", required: true },
      { key: "phone", label: "No. Telepon" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Alamat", type: "textarea", showInList: false },
    ]}
  />;
}
