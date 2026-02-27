"use client";

import { useTheme } from "@/context/ThemeContext";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      richColors
      position="top-right"
      toastOptions={{
        duration: 4000,
      }}
      {...props}
    />
  );
};

export { Toaster };
