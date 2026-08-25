export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="border-b border-[rgba(244,200,66,0.15)] bg-[#2A1015]/90 backdrop-blur px-8 py-6 sticky top-0 z-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-3xl text-[#F5F5F5]">{title}</h1>
          {subtitle && <p className="text-sm text-[#C4A484] mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-3">{actions}</div>}
      </div>
    </div>
  );
}
