import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.File;

public class GenerateIcon {
  public static void main(String[] args) throws Exception {
    BufferedImage im = new BufferedImage(512,512,BufferedImage.TYPE_INT_ARGB);
    Graphics2D g=im.createGraphics();
    g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);
    g.setRenderingHint(RenderingHints.KEY_RENDERING,RenderingHints.VALUE_RENDER_QUALITY);
    g.setPaint(new GradientPaint(0,0,new Color(28,28,30),0,512,new Color(2,2,3)));
    g.fill(new RoundRectangle2D.Float(8,8,496,496,92,92));
    g.setColor(new Color(45,45,48,120)); g.setStroke(new BasicStroke(2)); g.draw(new RoundRectangle2D.Float(9,9,494,494,90,90));
    int cx=256,cy=256;
    // Radar sweep glow
    for(int r=205;r>0;r-=3){float a=(float)(0.012+(205-r)*0.00018);g.setColor(new Color(255,105,0,Math.min(38,(int)(a*255))));g.fill(new Ellipse2D.Float(cx-r,cy-r,2*r,2*r));}
    // Sweep sector toward upper-right
    for(int a=0;a<100;a++){float alpha=(100-a)/100f*0.20f;g.setColor(new Color(255,112,0,(int)(alpha*255)));g.fill(new Arc2D.Float(cx-202,cy-202,404,404,35+a*0.2f,52-a*0.2f,Arc2D.PIE));}
    g.setColor(new Color(255,119,0,210));g.setStroke(new BasicStroke(7));g.draw(new Ellipse2D.Float(55,55,402,402));
    g.setColor(new Color(102,102,105,150));g.setStroke(new BasicStroke(3));
    for(int r=65;r<=174;r+=36)g.draw(new Ellipse2D.Float(cx-r,cy-r,2*r,2*r));
    g.setColor(new Color(115,115,118,155));g.setStroke(new BasicStroke(3));
    g.draw(new Line2D.Float(52,256,460,256));g.draw(new Line2D.Float(256,52,256,460));
    // Approximate region silhouette
    Path2D p=new Path2D.Float();
    p.moveTo(112,205);p.lineTo(133,184);p.lineTo(159,190);p.lineTo(172,168);p.lineTo(201,175);p.lineTo(218,192);p.lineTo(245,186);p.lineTo(263,204);p.lineTo(292,195);p.lineTo(310,213);p.lineTo(343,208);p.lineTo(359,230);p.lineTo(386,234);p.lineTo(395,260);p.lineTo(418,278);p.lineTo(405,301);p.lineTo(419,326);p.lineTo(389,338);p.lineTo(371,365);p.lineTo(343,355);p.lineTo(326,382);p.lineTo(299,368);p.lineTo(281,390);p.lineTo(257,366);p.lineTo(232,379);p.lineTo(215,353);p.lineTo(187,355);p.lineTo(172,332);p.lineTo(145,334);p.lineTo(132,309);p.lineTo(111,300);p.lineTo(124,273);p.lineTo(104,250);p.closePath();
    g.setColor(new Color(65,65,68,155));g.fill(p);g.setColor(new Color(132,132,135,145));g.setStroke(new BasicStroke(3));g.draw(p);
    // Beam line
    g.setPaint(new GradientPaint(cx,cy,new Color(255,145,0,230),cx+175,cy-155,new Color(255,112,0,5)));
    Path2D beam=new Path2D.Float();beam.moveTo(cx,cy);beam.lineTo(414,112);beam.lineTo(435,142);beam.closePath();g.fill(beam);
    g.setColor(new Color(255,132,0,220));g.setStroke(new BasicStroke(4));g.draw(new Line2D.Float(cx,cy,414,112));
    // Targets
    int[][] pts={{338,145,24},{360,302,10},{165,265,12},{198,367,9},{365,214,8},{205,145,7}};
    for(int[] q:pts){g.setColor(new Color(255,115,0,50));g.fill(new Ellipse2D.Float(q[0]-q[2]*1.8f,q[1]-q[2]*1.8f,q[2]*3.6f,q[2]*3.6f));g.setColor(new Color(255,137,0));g.fill(new Ellipse2D.Float(q[0]-q[2]/2f,q[1]-q[2]/2f,q[2],q[2]));}
    g.setColor(new Color(255,128,0));g.fill(new Ellipse2D.Float(cx-12,cy-12,24,24));
    g.dispose();
    File out=new File(args.length>0?args[0]:"assets/kostroma-radar-icon.png");out.getParentFile().mkdirs();ImageIO.write(im,"png",out);
  }
}