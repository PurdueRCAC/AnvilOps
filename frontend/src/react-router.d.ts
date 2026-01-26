import { NavigateOptions, To } from "react-router-dom";

// https://reactrouter.com/api/hooks/useNavigate#return-type-augmentation
declare module "react-router" {
  interface NavigateFunction {
    (to: To, options?: NavigateOptions): void;
    (delta: number): void;
  }
}
