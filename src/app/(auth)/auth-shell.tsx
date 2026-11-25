import { ThemeToggle } from '@/components/theme-toggle';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <ThemeToggle />
      <section className="flex flex-[1_1_420px] flex-col justify-between gap-8 bg-brand p-14 text-white">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-surface text-[22px] font-extrabold text-brand">F</div>
          <div className="text-[26px] font-extrabold">FocoJur</div>
        </div>
        <div className="flex max-w-[460px] flex-col gap-3">
          <h1 className="text-[40px] font-extrabold leading-[1.15]">Todos os processos da Foco, num só lugar.</h1>
          <p className="text-[17px] leading-normal">Captura, cadastro, prazos e painéis do Jurídico.</p>
        </div>
        <p className="text-[13px]">DUO Technology · Grupo Foco</p>
      </section>
      <section className="flex flex-[1_1_420px] items-center justify-center bg-surface px-8 py-14">
        <div className="flex w-full max-w-[400px] flex-col gap-5">{children}</div>
      </section>
    </div>
  );
}
