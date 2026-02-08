import { getCorrectEnvBlanks } from "@/components/config/workload/EnvVarGrid";
import HelpTooltip from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

type EnvVars = { name: string; value: string | null; isSensitive: boolean }[];

export const EnvsWithDiffs = ({
  base,
  value: envVars,
  setValue: setEnvironmentVariables,
  fixedSensitiveVars,
  disabled = false,
}: {
  base: EnvVars;
  value: EnvVars;
  setValue: (updater: (envVars: EnvVars) => EnvVars) => void;
  fixedSensitiveVars: Record<string, number>;
  disabled?: boolean;
}) => {
  const [error, setError] = useState("");
  useEffect(() => {
    const names = new Set<string>();
    const duplicates = new Set<string>();

    envVars.forEach((env) => {
      if (env.name === "") return;

      if (names.has(env.name)) {
        duplicates.add(env.name);
      } else {
        names.add(env.name);
      }
    });

    if (duplicates.size !== 0) {
      setError(
        `Duplicate environment variable(s): ${[...duplicates.values()].join(", ")}`,
      );
    } else {
      setError("");
    }
  }, [envVars, setEnvironmentVariables]);

  const currentEnv = envVars.reduce(
    (obj, current) => {
      obj[current.name] = {
        value: current.value,
        isSensitive: current.isSensitive,
      };
      return obj;
    },
    {} as Record<string, { value: string | null; isSensitive: boolean }>,
  );

  const changedBaseVars = base.filter(
    (envVar) =>
      !(envVar.name in currentEnv) ||
      envVar.value !== currentEnv[envVar.name].value,
  );

  return (
    <div className="grid grid-cols-[1fr_min-content_1fr_min-content_min-content] items-center gap-2">
      <span className="col-span-2 text-sm">Name</span>
      <span className="col-span-1 text-sm">Value</span>
      <span className="col-span-1 flex items-center justify-start gap-1 text-sm">
        Sensitive
        <HelpTooltip size={15}>
          <p>The values of sensitive environment variables cannot be viewed</p>
          <p>in the app settings, and their names cannot be changed later.</p>
        </HelpTooltip>
      </span>
      <span></span>
      {envVars.map(({ name, value, isSensitive }, index) => {
        const isFixedSensitive = fixedSensitiveVars[name] == index;
        return (
          <Fragment key={index}>
            <Input
              placeholder="NODE_ENV"
              required={index !== envVars.length - 1}
              className="w-full"
              disabled={disabled || isFixedSensitive}
              disabledTooltip={
                !disabled && (
                  <p>
                    The name of a sensitive environment variable cannot be
                    changed.
                  </p>
                )
              }
              value={name}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEnvironmentVariables((prev) =>
                  getCorrectEnvBlanks(
                    prev.toSpliced(index, 1, {
                      ...prev[index],
                      name: value,
                    }),
                  ),
                );
              }}
            />
            <span className="w-fit align-middle text-xl">=</span>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- This label is associated with its child */}
            <label>
              <Input
                disabled={disabled}
                placeholder={isFixedSensitive ? "Hidden value" : "production"}
                className="w-full"
                value={value ?? ""}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setEnvironmentVariables((prev) =>
                    getCorrectEnvBlanks(
                      prev.toSpliced(index, 1, {
                        ...prev[index],
                        value: value,
                      }),
                    ),
                  );
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
              />
            </label>
            <div className="text-center">
              <Checkbox
                className="size-6"
                disabled={disabled || isFixedSensitive}
                checked={isSensitive}
                onCheckedChange={(checked) => {
                  setEnvironmentVariables((prev) =>
                    getCorrectEnvBlanks(
                      prev.toSpliced(index, 1, {
                        ...prev[index],
                        isSensitive: checked === true,
                      }),
                    ),
                  );
                }}
              />
            </div>
            <Button
              disabled={disabled}
              variant="secondary"
              type="button"
              onClick={() => {
                setEnvironmentVariables((prev) =>
                  index != prev.length - 1 ? prev.toSpliced(index, 1) : prev,
                );
              }}
            >
              <Trash2 />
            </Button>
          </Fragment>
        );
      })}
      <p className="col-span-5 text-sm text-red-500">{error}</p>
      {changedBaseVars.length > 0 && (
        <>
          <p className="text-black-4 col-span-full my-2 text-base">
            These variables will be removed:
          </p>
          <span className="text-black-4 col-span-2 text-sm">Name</span>
          <span className="text-black-4 col-span-1 text-sm">Value</span>
          <span className="text-black-4 col-span-1 text-sm">Sensitive</span>
          <span></span>
          {changedBaseVars.map(({ name, value, isSensitive }, index) => (
            <Fragment key={`base-${index}`}>
              <Input
                disabled
                value={name}
                className="w-full bg-red-200 italic"
              />
              <span className="w-fit align-middle text-xl">=</span>
              <Input
                disabled
                value={value ?? "Hidden value"}
                className="w-full bg-red-200 italic"
              />
              <div className="text-center">
                <Checkbox className="size-6" disabled checked={isSensitive} />
              </div>
              <span></span>
            </Fragment>
          ))}
        </>
      )}
    </div>
  );
};
