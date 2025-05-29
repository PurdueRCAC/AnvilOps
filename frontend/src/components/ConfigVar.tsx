import { Input } from '@/components/ui/input';

export default function ConfigVar({ name, value, namePlaceholder, valuePlaceholder, secret=false} : {
    name?: string,
    value?: string,
    namePlaceholder?: string,
    valuePlaceholder?: string,
    secret?: boolean,
}) {
    return <div className='w-full'>
        <Input type='input' value={name} placeholder={namePlaceholder} className='w-1/3 inline-block'/>
        <Input type={secret ? 'password' : 'input'} value={value} placeholder={valuePlaceholder} className='w-1/3 inline-block'/>
    </div>
}