import { Trash2 } from "lucide-react";
import { Fragment, useEffect, type Dispatch } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type EnvVars = { key: string; value: string }[];

export const EnvVarGrid = ({
  value: envVars,
  setValue: setEnvironmentVariables,
}: {
  value: EnvVars;
  setValue: Dispatch<EnvVars>;
}) => {
  useEffect(() => {
    for (let i in envVars) {
      if (envVars[i].key === "" && +i < envVars.length - 1) {
        setEnvironmentVariables(envVars.toSpliced(+i, 1));
      }
    }
    if (envVars[envVars.length - 1]?.key !== "") {
      setEnvironmentVariables([...envVars, { key: "", value: "" }]);
    }
  }, [envVars]);

  return (
    <div className="grid grid-cols-[1fr_min-content_1fr_min-content] items-center gap-2">
      {envVars.map(({ key, value }, index) => (
        <Fragment key={index}>
          <Input
            placeholder="NODE_ENV"
            required={index !== envVars.length - 1}
            className="w-full"
            value={key}
            onChange={(e) => {
              const newList = structuredClone(envVars);
              newList[index].key = e.currentTarget.value;
              setEnvironmentVariables(newList);
            }}
          />
          <span className="text-xl align-middle">=</span>
          <Input
            placeholder="production"
            className="w-full"
            value={value}
            onChange={(e) => {
              const newList = structuredClone(envVars);
              newList[index].value = e.currentTarget.value;
              setEnvironmentVariables(newList);
            }}
          />
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setEnvironmentVariables(envVars.filter((_, i) => i !== index));
            }}
          >
            <Trash2 />
          </Button>
        </Fragment>
      ))}
    </div>
  );
};
