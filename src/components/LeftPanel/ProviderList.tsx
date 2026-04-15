import { Button } from "@arco-design/web-react";
import { Plus } from "@icon-park/react";
import { useModelStore } from "../../stores/useModelStore";

const PROVIDERS = [
  { id: "official", name: "官方渠道", type: "official" as const },
  { id: "aws", name: "AWS Bedrock", type: "aws-bedrock" as const },
];

export const ProviderList: React.FC = () => {
  const { currentProvider, setCurrentProvider } = useModelStore();

  return (
    <div className="p-3 border-b border-gray-100">
      <div className="text-xs text-gray-500 mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1">
          供应商
        </span>
        <Button type="text" size="mini" icon={<Plus size={12} />} />
      </div>
      <div className="flex flex-col gap-1">
        {PROVIDERS.map((p) => (
          <Button
            key={p.id}
            size="small"
            long
            type={currentProvider?.id === p.id ? "primary" : "secondary"}
            onClick={() => setCurrentProvider(p)}
          >
            {p.name}
          </Button>
        ))}
      </div>
    </div>
  );
};
