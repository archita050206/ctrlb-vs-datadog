"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, type ReactNode, useMemo, useState } from "react";

import { cn } from "./components/ui/Utils";

const GB_PER_TB = 1000;
const CTRLB_RATE = 0.2;
const DD_INGEST = 0.1; // $/GB — charged on 100% of volume, including what is discarded
const DD_INDEX = 1.7; // $ per million events — charged only on the indexed share
const EVENTS_PER_GB = 1; // ~1 KB/event → 1M events per GB
const VOL_MAX_TB = 40;
const SIGNUP_URL = "https://flow.ctrlb.ai/auth/sign-up";

// Stepped y-axis ceilings (like /pricing feel): bars grow inside a band;
// when cost crosses the next step the axis labels jump. Stops the taller
// bar from always being pinned at 100% of a live-scaled domain.
const Y_SCALE_STEPS = [5_000, 10_000, 20_000, 40_000, 72_000];

function chartScaleFor(maxCost: number) {
  const needed = Math.max(maxCost * 1.08, 1);
  const chartMax =
    Y_SCALE_STEPS.find((step) => step >= needed) ??
    Y_SCALE_STEPS[Y_SCALE_STEPS.length - 1];
  const yTicks = [0, 1, 2, 3, 4].map((i) => (chartMax * i) / 4);
  return { chartMax, yTicks };
}

const wrap = "mx-auto max-w-[1120px] px-7";

const btn =
  "inline-block cursor-pointer rounded-[9px] border border-transparent px-[18px] py-2.5 font-semibold text-[14.5px] transition-colors";

const btnPrimary =
  "bg-brand-primary text-white hover:bg-[#2536c9]";

const split =
  "grid grid-cols-1 max-[880px]:gap-0 min-[881px]:grid-cols-[1fr_88px_1fr]";

const colL = "min-[881px]:col-start-1 min-[881px]:pr-[34px]";
const colR = "min-[881px]:col-start-3 min-[881px]:pl-[34px]";

const tag =
  "inline-block rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.09em]";

const h3 =
  "m-0 text-[clamp(20px,2.5vw,24px)] font-bold leading-[1.25] tracking-[-0.025em] text-[#0b1020]";

const bodyP =
  "mx-auto m-0 max-w-[42ch] text-[15.5px] text-[#39405c]";

const viz =
  "flex h-full flex-col rounded-[14px] border border-[#e7e9f1] bg-[#f8f9fc] p-5";

const invRow =
  "flex items-center gap-3 rounded-[10px] border border-[#e7e9f1] bg-white px-3.5 py-3";

const invRowOff =
  "border-dashed border-[#dfe3ee] bg-transparent [&_.inv-name]:font-medium [&_.inv-name]:text-[#6b7288] [&_.inv-rate]:font-medium [&_.inv-rate]:text-[#98a0b5]";

const rangeInput = cn(
  "m-0 block w-full cursor-pointer appearance-none bg-transparent",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-brand-primary focus-visible:rounded-full",
  "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:[background:var(--track)]",
  "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[color:var(--thumb)] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_5px_rgba(11,16,32,0.22)]",
  "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:[background:var(--track)]",
  "[&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[color:var(--thumb)] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_1px_5px_rgba(11,16,32,0.22)]",
);

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function shortMoney(n: number) {
  if (n >= 1000) {
    return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return `$${Math.round(n)}`;
}

function rangeTrackStyle(value: number, min: number, max: number, color: string) {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    ["--track" as string]: `linear-gradient(90deg,${color} 0%,${color} ${pct}%,#dfe2ee ${pct}%,#dfe2ee 100%)`,
    ["--thumb" as string]: color,
  };
}

function Rule() {
  return (
    <div className="col-start-2 row-span-full hidden w-px justify-self-center bg-[#e7e9f1] min-[881px]:block" />
  );
}

function InvDot({ className }: { className: string }) {
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", className)} />;
}

function InvName({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <span className="inv-name min-w-0 flex-1 text-[13.5px] font-semibold text-[#0b1020]">
      {title}
      <span className="mt-px block text-[12.5px] font-normal text-[#6b7288]">
        {subtitle}
      </span>
    </span>
  );
}

export default function DatadogAlternative() {
  const [volumeTb, setVolumeTb] = useState(10);
  const [indexPct, setIndexPct] = useState(15);
  const [email, setEmail] = useState("");

  const calc = useMemo(() => {
    const gb = volumeTb * GB_PER_TB;
    const ctrlb = gb * CTRLB_RATE;
    const ddIngest = gb * DD_INGEST;
    const ddIndex = gb * (indexPct / 100) * EVENTS_PER_GB * DD_INDEX;
    const dd = ddIngest + ddIndex;
    const save = dd - ctrlb;
    const { chartMax, yTicks } = chartScaleFor(Math.max(ctrlb, dd));

    return { gb, ctrlb, ddIngest, ddIndex, dd, save, chartMax, yTicks };
  }, [volumeTb, indexPct]);

  function onDemoSubmit(e: FormEvent) {
    e.preventDefault();
    const params = email.trim()
      ? `?email=${encodeURIComponent(email.trim())}`
      : "";
    window.location.href = `/contact${params}`;
  }

  let saveLabel: string;
  let saveColorClass = "text-[#15883f]";
  let resultWarn = false;
  let resultText: ReactNode;

  if (calc.save > 0) {
    saveLabel = money(calc.save * 12);
    resultText = (
      <>
        CtrlB comes in{" "}
        <em className="not-italic text-[#15883f]">
          {money(calc.save)} a month lower
        </em>{" "}
        and still indexes 100% of the volume, against {indexPct}% on Datadog.
      </>
    );
  } else if (Math.round(calc.save) === 0) {
    saveLabel = "Break-even";
    saveColorClass = "text-[#6b7288]";
    resultWarn = true;
    resultText = (
      <>
        Same bill on both sides, except{" "}
        <em className="not-italic text-[#d92d20]">
          Datadog leaves {100 - indexPct}% of these logs unsearchable
        </em>
        .
      </>
    );
  } else {
    saveLabel = "—";
    saveColorClass = "text-[#6b7288]";
    resultWarn = true;
    resultText = (
      <>
        Under 4% indexed Datadog is the cheaper invoice, because{" "}
        <em className="not-italic text-[#d92d20]">
          almost everything you are storing is unreadable
        </em>
        . Past 4%, CtrlB is lower and searches all of it.
      </>
    );
  }

  return (
    <div className="bg-white text-[#0b1020] antialiased [font-size:16px] leading-relaxed">
      {/* Hero */}
      <header className="px-0 py-14 text-center min-[881px]:py-[88px] min-[881px]:pb-[60px]">
        <div className={wrap}>
          <span className="inline-block rounded-full bg-[#eef1ff] px-[15px] py-[7px] text-xs font-bold uppercase tracking-[0.11em] text-brand-primary">
            CtrlB vs Datadog · Pricing
          </span>
          <h1 className="mx-auto mt-6 max-w-[16ch] text-[clamp(33px,5.2vw,56px)] font-extrabold leading-[1.07] tracking-[-0.034em]">
            Datadog Pricing Explained: Why Your Bill Keeps Growing
          </h1>
          <p className="mx-auto mt-[22px] max-w-[58ch] text-[clamp(16.5px,1.9vw,19.5px)] text-[#6b7288]">
            Two meters run on every log you send Datadog: one to take it in,
            another to make it searchable. CtrlB runs one meter, at $0.20 a
            gigabyte.
          </p>

          <form
            className="mx-auto mt-9 flex max-w-[480px] rounded-xl border border-[#e7e9f1] bg-white p-1.5 shadow-[0_1px_2px_rgba(11,16,32,0.04),0_8px_28px_rgba(11,16,32,0.06)]"
            onSubmit={onDemoSubmit}
          >
            <input
              type="email"
              placeholder="Email Address"
              aria-label="Email address"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent px-3.5 font-[inherit] text-[15.5px] text-[#0b1020] outline-none placeholder:text-[#9ba1b4]"
            />
            <button
              className={cn(btn, btnPrimary, "whitespace-nowrap")}
              type="submit"
            >
              Book a demo
            </button>
          </form>
          <p className="mt-[15px] text-[14.5px] text-[#6b7288]">
            Or{" "}
            <a
              href={SIGNUP_URL}
              className="font-semibold text-[#0b1020] underline decoration-[#c9cee0] underline-offset-[3px]"
            >
              start free
            </a>{" "}
            on 150 GB a month, no card required.
          </p>
        </div>
      </header>

      {/* Brand band */}
      <section className="px-0 py-2 pb-1">
        <div className={wrap}>
          <div
            className={cn(
              split,
              "items-start gap-y-2.5 min-[881px]:grid-rows-[auto_auto] min-[881px]:gap-y-3.5",
            )}
          >
            <Rule />
            <div className="col-start-2 row-start-1 z-[2] hidden h-[38px] w-[38px] place-items-center self-center justify-self-center rounded-full border border-[#e7e9f1] bg-white text-xs font-bold tracking-[0.04em] text-[#6b7288] min-[881px]:grid">
              vs
            </div>

            <div
              className={cn(
                colL,
                "flex h-11 items-center justify-center min-[881px]:row-start-1",
              )}
            >
              <Image
                src=""
                alt="CtrlB"
                width={94}
                height={28}
                className="h-8 w-auto max-h-8 object-contain"
                priority
              />
            </div>
            <div
              className={cn(
                colR,
                "flex h-11 items-center justify-center min-[881px]:row-start-1",
              )}
            >
              {/* Datadog asset has more canvas padding than CtrlB, so it needs
                  a taller box to read at the same optical size. */}
              <Image
                src=""
                alt="Datadog"
                width={560}
                height={150}
                className="h-11 w-auto max-h-11 object-contain"
                priority
              />
            </div>

            <div
              className={cn(
                colL,
                "mx-auto mb-[22px] max-w-[36ch] text-center text-[15px] text-[#6b7288] min-[881px]:row-start-2 min-[881px]:mb-0",
              )}
            >
              The data lake your observability and security tools sit on top of.
            </div>
            <div
              className={cn(
                colR,
                "mx-auto mb-[22px] max-w-[36ch] text-center text-[15px] text-[#6b7288] min-[881px]:row-start-2 min-[881px]:mb-0",
              )}
            >
              A 20-product SaaS suite, each product metered on its own dimension.
            </div>
          </div>
        </div>
      </section>
              <div className="w-[70%] h-[0.5px] bg-[#DCE1EA] mx-auto mt-6"></div>
      {/* Point 01 */}
      <section className=" py-12 ">
        <div className={wrap}>
          <div
            className={cn(
              split,
              "min-[881px]:grid-rows-[auto_auto_auto_1fr]",
            )}
          >
            <Rule />
            <div className="col-start-2 row-start-1 z-[2] hidden justify-self-center self-start bg-white py-1 font-mono text-xs font-semibold text-[#6b7288] min-[881px]:block">
              01
            </div>

            <div
              className={cn(
                colL,
                "pb-4 text-center min-[881px]:row-start-1",
              )}
            >
              <span className={cn(tag, "bg-[#e9f8ee] text-[#15883f]")}>
                Billed once
              </span>
            </div>
            <div
              className={cn(
                colR,
                "pb-4 text-center max-[880px]:mt-10 min-[881px]:row-start-1",
              )}
            >
              <span className={cn(tag, "bg-[#fef3f2] text-[#d92d20]")}>
                Billed three times
              </span>
            </div>

            <div className={cn(colL, "pb-3 text-center min-[881px]:row-start-2")}>
              <h3 className={h3}>One rate covers the whole life of a log</h3>
            </div>
            <div className={cn(colR, "pb-3 text-center min-[881px]:row-start-2")}>
              <h3 className={h3}>Three meters run on the same log</h3>
            </div>

            <div className={cn(colL, "pb-6 text-center min-[881px]:row-start-3")}>
              <p className={bodyP}>
                Ingest, index, storage and search sit inside the same $0.20.
                Queries are never metered, so reading your own data back during an
                incident costs nothing extra.
              </p>
            </div>
            <div className={cn(colR, "pb-6 text-center min-[881px]:row-start-3")}>
              <p className={bodyP}>
                Taking the data in is one charge. Making it searchable is a
                second. Pulling an archived log back to read it is a third, and
                that one is billed on the volume scanned rather than the volume
                returned.
              </p>
            </div>

            <div className={cn(colL, "min-[881px]:row-start-4")}>
              <div className={viz}>
                <div className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.09em] text-[#6b7288]">
                  What a gigabyte costs
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className={invRow}>
                    <InvDot className="bg-[#22c55e]" />
                    <InvName
                      title="Ingestion"
                      subtitle="charged on everything that arrives"
                    />
                    <span className="inv-rate whitespace-nowrap font-mono text-[13px] font-semibold text-[#15883f]">
                      $0.20 / GB
                    </span>
                  </div>
                  <div className={cn(invRow, invRowOff)}>
                    <InvDot className="bg-[#c6cbdb]" />
                    <InvName
                      title="Indexing"
                      subtitle="30-day retention, 100% of events"
                    />
                    <span className="inv-rate whitespace-nowrap font-mono text-[13px] font-semibold">
                      included
                    </span>
                  </div>
                  <div className={cn(invRow, invRowOff)}>
                    <InvDot className="bg-[#c6cbdb]" />
                    <InvName
                      title="Reading it back"
                      subtitle="no archive tier, nothing to rehydrate"
                    />
                    <span className="inv-rate whitespace-nowrap font-mono text-[13px] font-semibold">
                      included
                    </span>
                  </div>
                  <div className="mt-[3px] flex items-baseline justify-between border-t border-dashed border-[#d9dde9] px-3.5 pt-[13px] text-[13px] font-semibold text-[#6b7288]">
                    <span>Line items on your invoice</span>
                    <b className="font-mono text-[15px] font-bold text-[#0b1020]">
                      1
                    </b>
                  </div>
                </div>
                <p className="mt-auto pt-4 text-center text-[13px] leading-[1.55] text-[#6b7288]">
                  One rate, one number to forecast.{" "}
                  <b className="font-semibold text-[#0b1020]">
                    Reads are never metered.
                  </b>
                </p>
              </div>
            </div>

            <div className={cn(colR, "min-[881px]:row-start-4")}>
              <div className={viz}>
                <div className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.09em] text-[#6b7288]">
                  What a gigabyte costs
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className={invRow}>
                    <InvDot className="bg-[#d92d20]" />
                    <InvName
                      title="Ingestion"
                      subtitle="charged on everything that arrives"
                    />
                    <span className="inv-rate whitespace-nowrap font-mono text-[13px] font-semibold text-[#d92d20]">
                      $0.10 / GB
                    </span>
                  </div>
                  <div className={invRow}>
                    <InvDot className="bg-[#f59e0b]" />
                    <InvName
                      title="Indexing"
                      subtitle="15-day default retention, per million events"
                    />
                    <span className="inv-rate whitespace-nowrap font-mono text-[13px] font-semibold text-[#b45309]">
                      $1.70 / M
                    </span>
                  </div>
                  <div className={invRow}>
                    <InvDot className="bg-[#632ca6]" />
                    <InvName
                      title="Rehydration"
                      subtitle="per compressed GB scanned, not returned"
                    />
                    <span className="inv-rate whitespace-nowrap font-mono text-[13px] font-semibold text-[#632ca6]">
                      $0.10 / GB
                    </span>
                  </div>
                  <div className="mt-[3px] flex items-baseline justify-between border-t border-dashed border-[#d9dde9] px-3.5 pt-[13px] text-[13px] font-semibold text-[#6b7288]">
                    <span>Line items on your invoice</span>
                    <b className="font-mono text-[15px] font-bold text-[#0b1020]">
                      3
                    </b>
                  </div>
                </div>
                <p className="mt-auto pt-4 text-center text-[13px] leading-[1.55] text-[#6b7288]">
                  Anything above your committed volume is rebilled at the
                  on-demand rate,{" "}
                  <b className="font-semibold text-[#0b1020]">
                    roughly 50% above the price you signed.
                  </b>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Point 02 */}
      <section className="border-t border-[#e7e9f1] py-14">
        <div className={wrap}>
          <div
            className={cn(
              split,
              "min-[881px]:grid-rows-[auto_auto_auto_1fr]",
            )}
          >
            <Rule />
            <div className="col-start-2 row-start-1 z-[2] hidden justify-self-center self-start bg-white py-1 font-mono text-xs font-semibold text-[#6b7288] min-[881px]:block">
              02
            </div>

            <div
              className={cn(
                colL,
                "pb-4 text-center min-[881px]:row-start-1",
              )}
            >
              <span className={cn(tag, "bg-[#e9f8ee] text-[#15883f]")}>
                Everything is searchable
              </span>
            </div>
            <div
              className={cn(
                colR,
                "pb-4 text-center max-[880px]:mt-10 min-[881px]:row-start-1",
              )}
            >
              <span className={cn(tag, "bg-[#fef3f2] text-[#d92d20]")}>
                A slice is searchable
              </span>
            </div>

            <div className={cn(colL, "pb-3 text-center min-[881px]:row-start-2")}>
              <h3 className={h3}>There is no index tier to choose</h3>
            </div>
            <div className={cn(colR, "pb-3 text-center min-[881px]:row-start-2")}>
              <h3 className={h3}>
                You pay for all of it, you can search part of it
              </h3>
            </div>

            <div className={cn(colL, "pb-6 text-center min-[881px]:row-start-3")}>
              <p className={bodyP}>
                CtrlB has one storage class. Every gigabyte you send is full-text
                searchable at the same price, which means no sampling rules to
                maintain and no log you paid for and cannot query.
              </p>
            </div>
            <div className={cn(colR, "pb-6 text-center min-[881px]:row-start-3")}>
              <p className={bodyP}>
                Ingestion bills the full volume, including the logs your filters
                drop a second later. Indexing bills again on the share you chose
                to keep searchable. Moving the rest to the cheaper Flex tier saves
                money by giving up monitors and Watchdog Insights.
              </p>
            </div>

            <div className={cn(colL, "min-[881px]:row-start-4")}>
              <div className={viz}>
                <div className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.09em] text-[#6b7288]">
                  10 TB sent, 30 days retained
                </div>
                <div className="flex flex-col gap-3.5">
                  {(
                    [
                      ["Billed", "10 TB", "bg-[#15883f]"],
                      ["Searchable", "10 TB", "bg-[#22c55e]"],
                      ["Alertable", "10 TB", "bg-[#22c55e]"],
                    ] as const
                  ).map(([label, value, color]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-[88px] shrink-0 text-right text-[12.5px] font-semibold text-[#6b7288]">
                        {label}
                      </span>
                      <div className="flex h-9 flex-1 overflow-hidden rounded-[9px] border border-[#e7e9f1] bg-white">
                        <div
                          className={cn(
                            "grid h-full w-full place-items-center overflow-hidden whitespace-nowrap font-mono text-[11.5px] font-bold text-white",
                            color,
                          )}
                        >
                          {value}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-auto pt-4 text-center text-[13px] leading-[1.55] text-[#6b7288]">
                  What you pay for and what you can query are{" "}
                  <b className="font-semibold text-[#0b1020]">
                    the same number.
                  </b>
                </p>
              </div>
            </div>

            <div className={cn(colR, "min-[881px]:row-start-4")}>
              <div className={viz}>
                <div className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.09em] text-[#6b7288]">
                  10 TB sent, 15% indexed
                </div>
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center gap-3">
                    <span className="w-[88px] shrink-0 text-right text-[12.5px] font-semibold text-[#6b7288]">
                      Billed
                    </span>
                    <div className="flex h-9 flex-1 overflow-hidden rounded-[9px] border border-[#e7e9f1] bg-white">
                      <div className="grid h-full w-full place-items-center overflow-hidden whitespace-nowrap bg-[#d92d20] font-mono text-[11.5px] font-bold text-white">
                        10 TB
                      </div>
                    </div>
                  </div>
                  {(
                    [
                      ["Searchable", "1.5", "8.5 TB dropped"],
                      ["Alertable", "1.5", "no monitors on Flex"],
                    ] as const
                  ).map(([label, kept, dropped]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-[88px] shrink-0 text-right text-[12.5px] font-semibold text-[#6b7288]">
                        {label}
                      </span>
                      <div className="flex h-9 flex-1 overflow-hidden rounded-[9px] border border-[#e7e9f1] bg-white">
                        <div className="grid h-full w-[15%] place-items-center overflow-hidden whitespace-nowrap bg-[#d92d20] font-mono text-[11.5px] font-bold text-white">
                          {kept}
                        </div>
                        <div className="grid h-full w-[85%] place-items-center overflow-hidden whitespace-nowrap bg-[repeating-linear-gradient(45deg,#f2f3f8,#f2f3f8_6px,#e8eaf2_6px,#e8eaf2_12px)] font-mono text-[11.5px] font-bold text-[#8b91a5]">
                          {dropped}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-auto pt-4 text-center text-[13px] leading-[1.55] text-[#6b7288]">
                  The 85% you cannot search{" "}
                  <b className="font-semibold text-[#0b1020]">
                    is still on the invoice.
                  </b>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Calculator */}
      <section
        className="border-t border-[#e7e9f1] py-[76px] min-[881px]:pt-[92px]"
        id="calculator"
      >
        <div className={wrap}>
          <div className="mx-auto mb-10 max-w-[60ch] text-center">
            <h2 className="m-0 mb-3.5 text-[clamp(28px,3.8vw,40px)] font-extrabold leading-[1.12] tracking-[-0.032em]">
              Run it against your own volume
            </h2>
            <p className="m-0 text-[17px] text-[#6b7288]">
              Set what you send a month, then set how much of it Datadog indexes.
              CtrlB has no second slider: 100% indexed is the only mode it has, at
              the same $0.20.
            </p>
          </div>

          <div className="rounded-[20px] border border-[#e7e9f1] bg-[#f8f9fc] p-[18px] shadow-[0_1px_2px_rgba(11,16,32,0.03),0_12px_40px_rgba(11,16,32,0.05)] min-[881px]:p-9">
            <div className="grid grid-cols-1 border-b border-[#e7e9f1] pb-7 text-center min-[881px]:grid-cols-3">
              <div className="min-[881px]:border-r min-[881px]:border-[#e7e9f1]">
                <div className="text-[clamp(25px,3.3vw,36px)] font-extrabold leading-[1.1] tracking-[-0.032em]">
                  {volumeTb} TB
                </div>
                <div className="mt-[7px] text-[13px] leading-[1.45] text-[#6b7288]">
                  logs per month
                  <br />
                  30-day retention
                </div>
              </div>
              <div className="mt-5 border-t border-[#e7e9f1] pt-5 min-[881px]:mt-0 min-[881px]:border-t-0 min-[881px]:border-r min-[881px]:border-[#e7e9f1] min-[881px]:pt-0">
                <div className="text-[clamp(25px,3.3vw,36px)] font-extrabold leading-[1.1] tracking-[-0.032em] text-[#d92d20]">
                  {indexPct}%
                </div>
                <div className="mt-[7px] text-[13px] leading-[1.45] text-[#6b7288]">
                  of that searchable
                  <br />
                  on Datadog
                </div>
              </div>
              <div className="mt-5 border-t border-[#e7e9f1] pt-5 min-[881px]:mt-0 min-[881px]:border-t-0 min-[881px]:pt-0">
                <div
                  className={cn(
                    "text-[clamp(25px,3.3vw,36px)] font-extrabold leading-[1.1] tracking-[-0.032em]",
                    saveColorClass,
                  )}
                >
                  {saveLabel}
                </div>
                <div className="mt-[7px] text-[13px] leading-[1.45] text-[#6b7288]">
                  a year back in budget
                  <br />
                  at these settings
                </div>
              </div>
            </div>

            <div className="grid gap-[30px] pb-1 pt-[30px]">
              <div>
                <div className="mb-3.5 flex items-baseline justify-between gap-4">
                  <span className="text-[15.5px] font-semibold text-[#39405c]">
                    Data volume
                  </span>
                  <span className="whitespace-nowrap text-[21px] font-extrabold tracking-[-0.025em]">
                    {volumeTb} TB
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={VOL_MAX_TB}
                  step={1}
                  value={volumeTb}
                  aria-label="Monthly log volume in terabytes"
                  className={rangeInput}
                  style={rangeTrackStyle(volumeTb, 1, 40, "#3146f2")}
                  onChange={(e) => setVolumeTb(Number(e.target.value))}
                />
                <div className="mt-2.5 flex justify-between gap-3 text-xs text-[#6b7288]">
                  <span>1 TB</span>
                  <span>40 TB</span>
                </div>
              </div>

              <div>
                <div className="mb-3.5 flex items-baseline justify-between gap-4">
                  <span className="text-[15.5px] font-semibold text-[#39405c]">
                    Datadog: share of logs indexed and searchable
                  </span>
                  <span className="whitespace-nowrap text-[21px] font-extrabold tracking-[-0.025em] text-[#d92d20]">
                    {indexPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={indexPct}
                  aria-label="Percentage of logs Datadog indexes"
                  className={rangeInput}
                  style={rangeTrackStyle(indexPct, 0, 100, "#d92d20")}
                  onChange={(e) => setIndexPct(Number(e.target.value))}
                />
                <div className="mt-2.5 flex justify-between gap-3 text-xs text-[#6b7288]">
                  <span>0%, nothing queryable</span>
                  <span>100%, full coverage</span>
                </div>
                <p className="mt-2.5 text-[12.5px] text-[#6b7288]">
                  Ingestion is billed on{" "}
                  <b className="font-semibold text-[#39405c]">
                    the full volume at either end of this slider
                  </b>
                  . All it changes is how much of what you already paid for you can
                  actually search.{" "}
                  <b className="font-semibold text-[#39405c]">
                    CtrlB stays at 100% indexed, $0.20/GB.
                  </b>
                </p>
              </div>
            </div>

            <div className="mt-[34px]">
              <div className="flex h-[320px] flex-col min-[881px]:h-[360px]">
                <div className="grid min-h-0 flex-1 grid-cols-[56px_1fr] gap-2">
                  {/* Label gutter matches plot so ticks align with bar tops */}
                  <div className="flex h-full flex-col">
                    <div className="h-8 shrink-0" aria-hidden />
                    <div className="relative min-h-0 flex-1">
                      {calc.yTicks.map((tick, i) => (
                        <div
                          key={`yt-${i}`}
                          className="absolute right-1.5 -translate-y-1/2 font-mono text-[11.5px] font-semibold text-[#6b7288]"
                          style={{ top: `${((4 - i) / 4) * 100}%` }}
                        >
                          {shortMoney(tick)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex h-full flex-col">
                    <div className="h-8 shrink-0" aria-hidden />
                    <div className="relative min-h-0 flex-1 overflow-visible border-b border-l border-[#e7e9f1]">
                      <div className="pointer-events-none absolute inset-0">
                        {[0, 25, 50, 75].map((pct) => (
                          <div
                            key={pct}
                            className="absolute inset-x-0 border-t border-dashed border-[#edeff6]"
                            style={{ top: `${pct}%` }}
                          />
                        ))}
                      </div>
                      <div className="absolute inset-0 flex justify-center gap-[clamp(48px,14vw,160px)] px-6">
                        {(
                          [
                            {
                              key: "ctrlb",
                              value: calc.ctrlb,
                              labelClass: "text-[#15883f]",
                              barClass:
                                "bg-gradient-to-b from-[#15883f] to-[#4ade80]",
                            },
                            {
                              key: "dd",
                              value: calc.dd,
                              labelClass: "text-[#d92d20]",
                              barClass:
                                "bg-gradient-to-b from-[#a51f14] to-[#f97066]",
                            },
                          ] as const
                        ).map((bar) => {
                          const heightPct = Math.min(
                            100,
                            Math.max(1.5, (bar.value / calc.chartMax) * 100),
                          );
                          return (
                            <div
                              key={bar.key}
                              className="relative h-full w-[clamp(88px,16vw,140px)]"
                            >
                              <div
                                className="absolute bottom-0 left-0 right-0 will-change-[height]"
                                style={{
                                  height: `${heightPct}%`,
                                  transition:
                                    "height 450ms cubic-bezier(0.4, 0, 0.2, 1)",
                                }}
                              >
                                <div
                                  className={cn(
                                    "absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap text-[clamp(15px,2.1vw,21px)] font-extrabold tracking-[-0.025em]",
                                    bar.labelClass,
                                  )}
                                >
                                  {money(bar.value)}
                                </div>
                                <div
                                  className={cn(
                                    "h-full min-h-1 w-full rounded-t-md",
                                    bar.barClass,
                                  )}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-center gap-[clamp(48px,14vw,160px)] pl-[56px]">
                <div className="w-[clamp(88px,16vw,140px)] text-center">
                  <div className="text-[15px] font-bold text-[#15883f]">CtrlB</div>
                  <div className="mt-0.5 font-mono text-xs text-[#6b7288]">
                    100% indexed
                  </div>
                </div>
                <div className="w-[clamp(88px,16vw,140px)] text-center">
                  <div className="text-[15px] font-bold text-[#d92d20]">
                    Datadog
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-[#6b7288]">
                    {indexPct}% indexed
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-[30px] grid grid-cols-1 items-center gap-[26px] border-t border-[#e7e9f1] pt-[26px] min-[881px]:grid-cols-[1.15fr_1fr]">
              <div
                className={cn(
                  "text-[clamp(18px,2.4vw,23px)] font-bold leading-[1.32] tracking-[-0.022em]",
                  resultWarn && "[&_em]:text-[#d92d20]",
                )}
              >
                {resultText}
              </div>
              <div className="overflow-x-auto rounded-[11px] border border-[#e7e9f1] bg-white px-[18px] py-4 font-mono text-xs leading-[1.9] text-[#39405c]">
                <span className="text-[#15883f]">CtrlB</span>{" "}
                {calc.gb.toLocaleString("en-US")} GB × $0.20{" "}
                <span className="text-[#8b91a5]">(all indexed)</span> ={" "}
                <b className="text-[#0b1020]">{money(calc.ctrlb)}</b>
                <br />
                <span className="text-[#d92d20]">Datadog</span>{" "}
                {calc.gb.toLocaleString("en-US")} GB × $0.10{" "}
                <span className="text-[#8b91a5]">(ingest, all of it)</span> ={" "}
                {money(calc.ddIngest)}
                <br />
                <span className="text-[#8b91a5]">
                  {"        "}
                  {Math.round((calc.gb * indexPct) / 100).toLocaleString("en-US")}{" "}
                  GB × $1.70/M{" "}
                  <span className="text-[#8b91a5]">(index {indexPct}%)</span> ={" "}
                  {money(calc.ddIndex)}
                </span>
                <br />
                <span className="text-[#d92d20]">{"        "}total</span> ={" "}
                <b className="text-[#0b1020]">{money(calc.dd)}</b>
              </div>
            </div>

            <p className="mt-6 text-[12.5px] leading-[1.8] text-[#6b7288]">
              <b className="font-semibold text-[#39405c]">
                How this is calculated.
              </b>{" "}
              CtrlB is volume × $0.20/GB, the published Pro rate at{" "}
              <Link
                href="/pricing"
                className="text-brand-primary no-underline hover:underline"
              >
                ctrlb.ai/pricing
              </Link>
              , with 30-day retention and 100% indexing included. Datadog is
              (full volume × $0.10/GB to ingest, including logs that are never
              indexed) + (indexed share × $1.70 per million events), with 15-day
              default retention — 30+ days is a sales conversation. Both sides
              assume 1 TB = 1,000 GB and an average log event of about 1 KB, so
              roughly one million events per GB. Your own figures will move with
              average event size and contract discount.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className={wrap}>
        <div className="mb-[76px] rounded-[20px] bg-[#0b1020] px-6 py-11 text-center text-white min-[881px]:px-10 min-[881px]:py-[60px]">
          <h2 className="m-0 mb-3.5 text-[clamp(25px,3.5vw,36px)] font-extrabold leading-[1.15] tracking-[-0.032em]">
            Stop deciding which logs deserve to be searchable
          </h2>
          <p className="mx-auto mb-7 max-w-[52ch] text-[16.5px] text-[#a5abc2]">
            Dual-ship off the Datadog Agent you already run, keep your dashboards
            where they are, and put the full stream in CtrlB at $0.20 a gigabyte.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              className="inline-block rounded-[9px] bg-white px-6 py-3 text-[15px] font-semibold text-[#0b1020] hover:bg-[#eef0f6]"
              href="/contact"
            >
              Talk to an engineer
            </Link>
            <a
              className={cn(btn, btnPrimary, "px-6 py-3 text-[15px]")}
              href={SIGNUP_URL}
            >
              Start free
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
