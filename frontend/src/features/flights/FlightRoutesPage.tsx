import ScheduleTemplatesTab from "./ScheduleTemplatesTab";

export default function FlightRoutesPage() {
  return (
    <div
      className="px-[21px] pb-[34px] pt-[18px]"
      dir="rtl"
      data-testid="flight-routes-page"
    >
      <div className="mb-5">
        <h1 className="m-0 text-[20.5px] font-black text-panel-ink">
          مسیرهای پروازی
        </h1>
        <p className="mt-1 text-[11.5px] leading-6 text-panel-muted">
          تعریف مسیر، روزهای هفته و بازه فصلی پروازها برای آژانس‌ها
        </p>
      </div>
      <div className="mb-4 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-[11px] leading-6 text-panel-muted">
        مسیر پروازی را با روزهای هفته و ساعت پرواز تعریف کنید؛ سامانه برای بازه
        فصل، پروازهای همان روزها را پس از کنترل تداخل ایجاد می‌کند. در پایان
        فصل می‌توانید برنامه فصل بعد را دوباره تعریف کنید.
      </div>
      <ScheduleTemplatesTab />
    </div>
  );
}
