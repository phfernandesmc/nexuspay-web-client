import { useTranslation } from "react-i18next";
import react from "@/assets/tech/react.svg";
import fastapi from "@/assets/tech/fastapi.svg";
import spring from "@/assets/tech/spring-boot.svg";
import postgres from "@/assets/tech/postgresql.svg";
import sqs from "@/assets/tech/aws-sqs-simple-queue-service.svg";
import docker from "@/assets/tech/docker.svg";

const STACK = [
  { src: react, nome: "React 19" },
  { src: fastapi, nome: "FastAPI" },
  { src: spring, nome: "Spring Boot 4" },
  { src: postgres, nome: "PostgreSQL 16" },
  { src: sqs, nome: "AWS SQS" },
  { src: docker, nome: "Docker" },
] as const;

export default function LandingStack() {
  const { t } = useTranslation("landing");

  return (
    <section id="stack" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <h2 className="text-center text-3xl font-bold">{t("landing:stack.title")}</h2>
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STACK.map((item) => (
          <li key={item.nome} className="flex flex-col items-center gap-2 rounded-xl border p-4">
            {/* alt vazio + aria-hidden: o nome ja esta escrito ao lado, e um
                leitor de tela anunciaria "React 19 React 19" sem isso. */}
            <img src={item.src} alt="" aria-hidden="true" className="size-8 object-contain" />
            <span className="text-center text-sm font-medium">{item.nome}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
