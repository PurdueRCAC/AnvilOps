import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function LandingView() {
  return (
    <div className="mx-auto max-w-prose my-10">
      <h1 className="text-4xl font-bold mb-4">AnvilOps</h1>
      <p>
        Anvil Composable Subsystem is a Kubernetes based private cloud managed
        with Rancher that provides a platform for creating composable
        infrastructure on demand. This cloud-style flexibility provides
        researchers the ability to self-deploy and manage persistent services to
        complement HPC workflows and run container-based data analysis tools and
        applications.
      </p>
      <Link to="/create-app" className="inline-block mt-8">
        <Button>Deploy Now</Button>
      </Link>
    </div>
  );
}
