import HelpTooltip from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { Fragment } from "react";

type EnvVars = { name: string; value: string | null; isSensitive: boolean }[];

export const EnvVarGrid = ({
  value: envVars,
  setValue: setEnvironmentVariables,
  fixedSensitiveVars,
  disabled = false,
}: {
  value: EnvVars;
  setValue: (updater: (envVars: EnvVars) => EnvVars) => void;
  fixedSensitiveVars: Record<string, number>;
  disabled: boolean;
}) => {
  const error = getEnvError(envVars);

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
        const isFixedSensitive = fixedSensitiveVars[name] === index;
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
              onClick={() =>
                setEnvironmentVariables((prev) =>
                  index != prev.length - 1 ? prev.toSpliced(index, 1) : prev,
                )
              }
            >
              <Trash2 />
            </Button>
          </Fragment>
        );
      })}
      <p className="col-span-4 text-sm text-red-500">{error}</p>
    </div>
  );
};

export const getCorrectEnvBlanks = (envVars: EnvVars): EnvVars => {
  const indicesToDelete = new Set<number>();
  envVars.forEach((env, idx) => {
    if (
      env.name === "" &&
      env.value === "" &&
      !env.isSensitive &&
      idx < envVars.length - 1
    ) {
      indicesToDelete.add(idx);
    }
  });
  const cleanedVars = envVars.filter((_, idx) => !indicesToDelete.has(idx));

  const last = cleanedVars[cleanedVars.length - 1];
  if (last.name !== "" || last.value !== "" || last.isSensitive) {
    cleanedVars.push({ name: "", value: "", isSensitive: false });
  }
  return cleanedVars;
};

const getDuplicates = (values: string[]) => {
  const unique = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (unique.has(value)) {
      duplicates.add(value);
    } else {
      unique.add(value);
    }
  });

  return duplicates;
};

export const getEnvError = (env: EnvVars) => {
  const duplicates = getDuplicates(env.map((ev) => ev.name).filter(Boolean));

  if (duplicates.size !== 0) {
    return `Duplicate environment variable(s): ${[...duplicates.values()].join(", ")}`;
  }

  return "";
};
