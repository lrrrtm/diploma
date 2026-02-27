import Lottie from "lottie-react";

export default function DuckScreen({ animationData, text }: { animationData: object; text: string }) {
  return (
    <div className="h-full overflow-hidden flex flex-col items-center justify-center bg-background px-6 text-center gap-3">
      <Lottie animationData={animationData} loop className="w-36 h-36" />
      <p className="text-white">{text}</p>
    </div>
  );
}
