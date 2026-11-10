import LoadingState from '@/components/ui/LoadingState'

// 后台页面切换时的占位：侧栏不动，内容区先出骨架。
export default function AppLoading() {
  return (
    <div className="pt-10">
      <div className="rounded-card border border-line bg-surface shadow-card">
        <LoadingState variant="list" rows={6} />
      </div>
    </div>
  )
}
