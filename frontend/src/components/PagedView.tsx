import { Button } from "./ui/button";
import { useState } from "react";

export const PagedView = ({
  children,
  submitButton,
}: {
  children: React.ReactNode[];
  submitButton: React.ReactNode;
}) => {
  const [idx, setIdx] = useState(0);
  return (
    <div className="space-y-2">
      {children.map((child, i) => {
        if (i === idx) {
          return child;
        }
        return <div className="hidden">{child}</div>;
      })}
      <div>
        {idx > 0 && (
          <Button
            variant="outline"
            type="button"
            onClick={() => setIdx((idx) => idx - 1)}
          >
            Back
          </Button>
        )}
        {idx < children.length - 1 ? (
          <Button
            type="button"
            onClick={() => setIdx((idx) => idx + 1)}
            className="float-right"
          >
            Next
          </Button>
        ) : (
          <div className="float-right inline">{submitButton}</div>
        )}
      </div>
    </div>
  );
};
