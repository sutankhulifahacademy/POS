import CrudList from "../components/CrudList";
export default function Outlets() {
  return <CrudList
    title="Outlet / Cabang"
    subtitle="Kelola cabang atau outlet multi-lokasi"
    endpoint="outlets"
    testPrefix="outlet"
    fields={[
      { key: "name", label: "Nama Outlet", required: true },
      { key: "address", label: "Alamat", type: "textarea" },
      { key: "phone", label: "No. Telepon" },
      { key: "is_main", label: "Outlet Utama", type: "checkbox", showInList: true },
    ]}
  />;
}
