export function AboutPage() {
  return (
    <main className="about-page">
      <section className="about-heading">
        <p className="hero-kicker">关于望学伴</p>
        <h1>一个帮助你学习、表达和了解中心的 AI 伙伴。</h1>
        <p>我们希望让提问变得更轻松：不急着给答案，先把问题说明白，再陪你一步一步找到思路。</p>
      </section>

      <section className="about-capabilities" aria-label="能力范围">
        <article><span>学</span><h2>学习与理解</h2><p>解释学习问题、梳理解题思路，把复杂内容拆成容易理解的小步骤。</p></article>
        <article><span>望</span><h2>了解中心</h2><p>根据已审核的资料，介绍申望儿童关爱服务中心的公开信息。</p></article>
        <article><span>聊</span><h2>普通交流</h2><p>陪你整理想法和感受，但不会代替老师、医生或心理咨询师。</p></article>
      </section>

      <section className="child-notice" id="child-safety">
        <div className="section-heading">
          <p className="hero-kicker">使用前，记住四件事</p>
          <h2>放心提问，也要保护好自己。</h2>
          <p>这些提醒很简单，但很重要。</p>
        </div>
        <div className="notice-grid">
          <article><strong>01</strong><h3>少说个人信息</h3><p>不要输入真实姓名、电话、微信号、住址、学校、班级、实时位置、照片、证件或账号密码。</p></article>
          <article><strong>02</strong><h3>尊重他人隐私</h3><p>不要输入同学、家人或老师不希望公开的事情，也不要替别人上传资料。</p></article>
          <article><strong>03</strong><h3>重要内容要核对</h3><p>AI 的回答可能出错。作业、健康和重要决定，请再和老师、家长或可信任的大人确认。</p></article>
          <article><strong>04</strong><h3>遇到危险先找人</h3><p>如果你或身边的人正在受到伤害，先离开危险的地方并告诉可信任的成年人；必要时拨打 110 或 120。</p></article>
        </div>
      </section>

      <section className="data-notice" id="data-notice">
        <div><p className="hero-kicker">数据说明</p><h2>你的记录，只跟着你的账号走。</h2></div>
        <div className="data-copy">
          <p>密码不会按原样保存。登录后，服务器通过安全 Cookie 识别你的设备；不同账号的对话记录彼此分开，同一账号则可以在其他设备上继续查看。</p>
          <p>页面不使用广告追踪 Cookie。你发送的问题会交给 AI 服务处理，因此请不要在对话中填写上方列出的个人信息。</p>
        </div>
      </section>

      <section className="project-overview" id="project-overview">
        <div>
          <p className="hero-kicker">项目概况</p>
          <h2>已部署基地</h2>
        </div>
        <div className="project-overview-copy">
          <strong>武穴市申望儿童关爱服务中心</strong>
          <p>更多服务点持续接入中。</p>
        </div>
      </section>

      <section className="project-changelog" id="project-changelog">
        <div>
          <p className="hero-kicker">项目概括</p>
          <h2>更新日志</h2>
        </div>
        <ol>
          <li><time dateTime="2026-06-16">6月16日</time><strong>形成项目初步方案，明确以 AI 学习陪伴和申望儿童关爱服务中心信息问答为核心应用方向。</strong></li>
          <li><time dateTime="2026-06-23">6月23日</time><strong>项目方案通过评审，确定前端交互、知识库建设、AI 工作流和云端部署四条并行开发路线。</strong></li>
          <li><time dateTime="2026-06-28">6月28日</time><strong>完成首版技术文档，明确数据整理规范、Dify 工作流架构、前后端接口边界及项目协作流程，正式进入开发阶段。</strong></li>
          <li><time dateTime="2026-07-06">7月6日</time><strong>完成儿童关爱知识库 v0.1，建立资料清洗、结构化分段与问答检索流程，为儿童关爱相关回答提供数据基础。</strong></li>
          <li><time dateTime="2026-07-08">7月8日</time><strong>完成基地课程知识库 v0.1，对课程资料进行分类、清洗和知识单元整理，接入 AI 检索链路。</strong></li>
          <li><time dateTime="2026-07-13">7月13日</time><strong>完成后端与云服务平台搭建，在 Linux 服务器上以 Docker 部署 Dify 社区版，并配置数据存储、模型 API 和安全访问链路。</strong></li>
          <li><time dateTime="2026-07-21">7月21日</time><strong>完成前端与云服务平台搭建，实现注册登录、账号鉴权、对话历史保存及 Dify API 的服务端转发。</strong></li>
          <li><time dateTime="2026-07-23">7月23日</time><strong>完成前后端联调，验证流式对话、Markdown 与数学公式渲染、多设备记录同步及异常处理流程。</strong></li>
          <li><time dateTime="2026-07-24">7月24日</time><strong>发布基地课程知识库 v0.2，补充课程内容并优化知识分段与检索匹配效果。</strong></li>
          <li><time dateTime="2026-07-25">7月25日</time><strong>发布 v0.10725，完成 Netlify 前端发布、云端服务接入与自定义域名配置，并在武穴市申望儿童关爱服务中心进入试运行。</strong></li>
        </ol>
      </section>

      <section className="contact-notice" id="contact-us">
        <div>
          <p className="hero-kicker">联系我们</p>
          <h2>项目团队</h2>
        </div>
        <div className="contact-card">
          <div className="contact-person primary-contact">
            <p><span>后端</span><strong>褚安志</strong></p>
            <a href="mailto:chuazh2025@shanghaitech.edu.cn">邮箱：chuazh2025@shanghaitech.edu.cn</a>
            <a href="tel:+8617321063848">电话：173 2106 3848</a>
          </div>
          <div className="contact-person">
            <p><span>前端</span><strong>褚安志、魏玄霖</strong></p>
          </div>
          <div className="contact-person">
            <p><span>数据</span><strong>王浩琪</strong></p>
          </div>
        </div>
      </section>
    </main>
  )
}
