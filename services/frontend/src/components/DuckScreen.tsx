import Lottie from "lottie-react";

export default function DuckScreen({ animationData, text }: { animationData: object; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100dvh-180px)] px-6 text-center gap-3">
      <Lottie animationData={animationData} loop className="w-36 h-36" />
      <p className="text-foreground">{text}</p>
    </div>
  );
}

