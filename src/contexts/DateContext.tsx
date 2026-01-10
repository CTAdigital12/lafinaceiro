import { createContext, useContext, useState, ReactNode } from "react";

interface DateContextType {
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  month: number;
  year: number;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

export function DateProvider({ children }: { children: ReactNode }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  return (
    <DateContext.Provider value={{ currentDate, setCurrentDate, month, year }}>
      {children}
    </DateContext.Provider>
  );
}

export function useDate() {
  const context = useContext(DateContext);
  if (context === undefined) {
    throw new Error("useDate must be used within a DateProvider");
  }
  return context;
}
