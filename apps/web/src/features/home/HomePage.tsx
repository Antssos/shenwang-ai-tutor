import { Link } from "react-router-dom";
import heroIllustration from "../../assets/home-hero.png";
import featureSteps from "../../assets/feature-steps.png";
import featureRevise from "../../assets/feature-revise.png";
import featureSync from "../../assets/feature-sync.png";
import { CookieNotice } from "./CookieNotice";

interface HomePageProps {
  username: string | null;
}

export function HomePage({ username }: HomePageProps) {
  return (
    <>
      <main className="home-page">
        <section className="home-hero">
          <div className="hero-copy">
            <p className="hero-kicker">专为成长中的好奇心准备</p>
            <h1>
              每一个问题，
              <br />
              <span>都值得慢慢弄懂。</span>
            </h1>
            <p className="hero-lead">
              望学伴是一个清晰、温和的 AI
              学习伙伴。问学习、了解中心，也可以把复杂的问题拆成容易理解的小步骤。
            </p>
            <div className="hero-actions">
              <Link
                className="button primary large"
                to={username ? "/chat" : "/register"}
              >
                {username ? "继续对话" : "开始使用"}
                <span aria-hidden="true">→</span>
              </Link>
              <Link className="button text" to="/about">
                先了解望学伴
              </Link>
            </div>
          </div>
          <div className="hero-visual" aria-label="望学伴和书本的童趣插画">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <img
              decoding="async"
              fetchPriority="high"
              src={heroIllustration}
              alt="绿色星星伙伴陪着一本打开的书"
            />
          </div>
        </section>

        <section className="feature-story" id="features" aria-label="产品特点">
          <article className="feature-story-item">
            <div className="feature-media">
              <img
                loading="lazy"
                decoding="async"
                src={featureSteps}
                alt="望学伴把复杂问题整理成清楚步骤"
              />
            </div>
            <div className="feature-story-copy">
              <div className="feature-story-intro">
                <p className="hero-kicker">和你的思路一起往前走</p>
                <h2>
                  不只回答问题，
                  <br />
                  也在意你怎样弄懂。
                </h2>
              </div>
              <span>01</span>
              <h3>先找到下一小步。</h3>
              <p>
                遇到复杂问题时，望学伴会先分清已知条件、目标和容易卡住的地方，再把思路拆成可以逐步完成的小任务。
              </p>
              <div className="feature-use-detail">
                <strong>适合这样使用</strong>
                <ul>
                  <li>题目条件很多，不知道应该先看哪里</li>
                  <li>已经有一点想法，想检查思路是否完整</li>
                  <li>希望先得到提示，再自己完成后面的步骤</li>
                </ul>
              </div>
            </div>
          </article>

          <article className="feature-story-item reverse">
            <div className="feature-media">
              <img
                loading="lazy"
                decoding="async"
                src={featureRevise}
                alt="望学伴陪你修改问题并继续思考"
              />
            </div>
            <div className="feature-story-copy">
              <span>02</span>
              <h3>想清楚以后，随时改口。</h3>
              <p>
                表达不必一次完成。你可以修改已经发出的提问，让对话从新的想法继续，而不是重新解释全部背景。
              </p>
              <div className="feature-use-detail">
                <strong>对话可以这样调整</strong>
                <ul>
                  <li>点开自己消息下方的“编辑”按钮</li>
                  <li>补充遗漏的条件，或换一种更清楚的说法</li>
                  <li>保存后，望学伴会从这条消息重新回答</li>
                </ul>
              </div>
            </div>
          </article>

          <article className="feature-story-item">
            <div className="feature-media">
              <img
                loading="lazy"
                decoding="async"
                src={featureSync}
                alt="同一账号在不同设备继续之前的对话"
              />
            </div>
            <div className="feature-story-copy">
              <span>03</span>
              <h3>换一台设备，也能接着聊。</h3>
              <p>
                对话记录跟随账号保存。登录同一个账号，就能找到之前的问题和回答，从停下的地方继续。
              </p>
              <div className="feature-use-detail">
                <strong>继续之前的对话</strong>
                <ul>
                  <li>在新设备上登录同一个望学伴账号</li>
                  <li>从“最近对话”中找到之前的问题</li>
                  <li>打开记录后，可以继续追问或修改提问</li>
                </ul>
              </div>
            </div>
          </article>
        </section>
      </main>
      <CookieNotice />
    </>
  );
}
