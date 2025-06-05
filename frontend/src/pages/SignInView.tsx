import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignInView() {
  return (
    <div className="h-screen flex flex-col justify-center items-center">
      <div className="w-3/4 lg:w-1/3 min-h-1/2 bg-neutral-1 rounded-2xl shadow-md shadow-neutral-3 flex justify-center items-center">
        <div className="flex flex-col justify-around items-center w-3/4">
          <h1 className="font-bold text-3xl text-main-5 mb-5">Sign In</h1>
          <form action="/api/login" method="GET">
            <Button className="w-52">Sign in with ACCESS</Button>
          </form>
          {/* <h2>Connect GitHub Account</h2>
                    <p className='text-center'>This is required to deploy from an existing repository.</p>
                    <Button>Sign In with GitHub</Button>
                    <Button variant='secondary'>Skip</Button> */}
        </div>
      </div>
    </div>
  );
}
